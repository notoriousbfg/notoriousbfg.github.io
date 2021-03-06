package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io/ioutil"
	"os"
	"sync"
	"text/template"
	"time"

	"github.com/gomarkdown/markdown"
	"github.com/gorilla/feeds"
	"github.com/h2non/bimg"
	"github.com/hashicorp/go-multierror"
)

func ReadPosts() ([]Post, error) {
	var posts []Post

	items, err := ioutil.ReadDir("../posts")
	if err != nil {
		return nil, fmt.Errorf("error reading posts directory")
	}

	for _, item := range items {
		if item.IsDir() {
			post := Post{
				SrcPath: fmt.Sprintf("../posts/%s", item.Name()),
			}

			subItems, err := ioutil.ReadDir(post.SrcPath)

			if err != nil {
				return nil, fmt.Errorf("error reading post directory: %v", item)
			}

			for _, subItem := range subItems {
				if subItem.Name() == "config.json" {
					filePath := fmt.Sprintf("%s/config.json", post.SrcPath)
					contents, err := ioutil.ReadFile(filePath)
					if err != nil {
						return nil, fmt.Errorf("error reading config file: %s", filePath)
					}

					if err = json.Unmarshal([]byte(contents), &post.Config); err != nil {
						return nil, fmt.Errorf("error unmarshalling JSON (%s): %+v\n", filePath, err)
					}
				}
			}

			posts = append(posts, post)
		}
	}

	return posts, nil
}

func BuildSite(site *Site) error {
	truncatePublicDir()

	posts, readErr := ReadPosts()

	if readErr != nil {
		return readErr
	}

	site.Posts = posts

	var buildErr error

	if err := BuildPosts(site); err != nil {
		buildErr = multierror.Append(buildErr, err)
	}

	if err := BuildHomePage(site); err != nil {
		buildErr = multierror.Append(buildErr, err)
	}

	var wg sync.WaitGroup
	wg.Add(4)

	go func() {
		defer wg.Done()
		if err := BuildArchivePage(site); err != nil {
			buildErr = multierror.Append(buildErr, err)
		}
	}()

	go func() {
		defer wg.Done()
		if err := BuildPhotoFeedPage(site); err != nil {
			buildErr = multierror.Append(buildErr, err)
		}
	}()

	go func() {
		defer wg.Done()
		if err := BuildRSSFeed(site); err != nil {
			buildErr = multierror.Append(buildErr, err)
		}
	}()

	go func() {
		defer wg.Done()
		if err := BuildBookRecommendations(site); err != nil {
			buildErr = multierror.Append(buildErr, err)
		}
	}()

	wg.Wait()

	if buildErr != nil {
		return buildErr
	}

	fmt.Println("build finished")

	return nil
}

func BuildPosts(site *Site) error {
	for key, post := range site.Posts {
		var newDir string
		if post.Config.Category == "photo" {
			newDir = fmt.Sprintf("../docs/photo/%s", post.Config.Slug)
		} else {
			newDir = fmt.Sprintf("../docs/%s", post.Config.Slug)
		}

		err := os.MkdirAll(newDir, os.ModePerm)
		if err != nil {
			return err
		}

		post.RenderPath = newDir

		newFilePath := fmt.Sprintf("%s/index.html", newDir)
		fp, err := os.OpenFile(newFilePath, os.O_RDWR|os.O_CREATE|os.O_TRUNC, 0755)
		if err != nil {
			return err
		}

		var renderError error
		switch post.Config.Category {
		case "photo":
			renderError = RenderPhoto(&post, site)
		case "blog":
			renderError = RenderPost(&post, site)
		}

		if renderError != nil {
			return renderError
		}

		fp.WriteString(post.RenderedContent)

		if err := fp.Close(); err != nil {
			return err
		}

		site.Posts[key] = post
	}

	return nil
}

func BuildHomePage(site *Site) error {
	template := template.Must(
		template.ParseFiles("./templates/home.html", "./templates/base.html"),
	)

	var content bytes.Buffer
	templateErr := template.ExecuteTemplate(&content, "base", PageData{
		Site: *site,
	})
	if templateErr != nil {
		return fmt.Errorf("error generating template: \n%+v\n", templateErr)
	}

	newFilePath := fmt.Sprintf("../docs/index.html")
	fp, err := os.OpenFile(newFilePath, os.O_RDWR|os.O_CREATE|os.O_TRUNC, 0755)
	if err != nil {
		return err
	}

	fp.WriteString(content.String())

	if err := fp.Close(); err != nil {
		return err
	}

	return nil
}

func BuildArchivePage(site *Site) error {
	template := template.Must(
		template.ParseFiles("./templates/archive.html", "./templates/base.html"),
	)

	var content bytes.Buffer
	templateErr := template.ExecuteTemplate(&content, "base", PageData{
		Site: *site,
	})
	if templateErr != nil {
		return fmt.Errorf("error generating template: \n%+v\n", templateErr)
	}

	err := os.MkdirAll("../docs/archive", os.ModePerm)
	if err != nil {
		return err
	}

	newFilePath := fmt.Sprintf("../docs/archive/index.html")
	fp, err := os.OpenFile(newFilePath, os.O_RDWR|os.O_CREATE|os.O_TRUNC, 0755)
	if err != nil {
		return err
	}

	fp.WriteString(content.String())

	if err := fp.Close(); err != nil {
		return err
	}

	return nil
}

func BuildPhotoFeedPage(site *Site) error {
	template := template.Must(
		template.ParseFiles("./templates/photo/feed.html", "./templates/base.html"),
	)

	var content bytes.Buffer
	templateErr := template.ExecuteTemplate(&content, "base", PageData{
		Site: *site,
	})
	if templateErr != nil {
		return fmt.Errorf("error generating template: \n%+v\n", templateErr)
	}

	err := os.MkdirAll("../docs/photo", os.ModePerm)
	if err != nil {
		return err
	}

	newFilePath := fmt.Sprintf("../docs/photo/index.html")
	fp, err := os.OpenFile(newFilePath, os.O_RDWR|os.O_CREATE|os.O_TRUNC, 0755)
	if err != nil {
		return err
	}

	fp.WriteString(content.String())

	if err := fp.Close(); err != nil {
		return err
	}

	return nil
}

func RenderPost(post *Post, site *Site) error {
	postPath := fmt.Sprintf("%s/post.md", post.SrcPath)
	contents, pathErr := ioutil.ReadFile(postPath)

	if pathErr != nil {
		return fmt.Errorf("error reading file: %s", postPath)
	}

	post.Content = string(markdown.ToHTML(contents, nil, nil))

	template := template.Must(
		template.ParseFiles("./templates/post.html", "./templates/base.html"),
	)

	var content bytes.Buffer
	templateErr := template.ExecuteTemplate(&content, "base", PageData{
		Post: *post,
		Site: *site,
	})
	if templateErr != nil {
		return fmt.Errorf("error generating template: \n%+v\n", templateErr)
	}

	post.RenderedContent = content.String()
	return nil
}

func RenderPhoto(post *Post, site *Site) error {
	_, err := ResizeImage(post)
	if err != nil {
		return err
	}

	postPath := fmt.Sprintf("%s/post.md", post.SrcPath)
	contents, pathErr := ioutil.ReadFile(postPath)

	if pathErr != nil {
		return fmt.Errorf("error reading file: %s", postPath)
	}

	post.Content = string(markdown.ToHTML(contents, nil, nil))

	post.Image = fmt.Sprintf("/photo/%s/resized.jpg", post.Config.Slug)

	template := template.Must(
		template.ParseFiles("./templates/photo/photo.html", "./templates/base.html"),
	)

	var content bytes.Buffer
	templateErr := template.ExecuteTemplate(&content, "base", PageData{
		Post: *post,
		Site: *site,
	})
	if templateErr != nil {
		return fmt.Errorf("error generating template: \n%+v\n", templateErr)
	}

	post.RenderedContent = content.String()
	return nil
}

func ResizeImage(post *Post) (string, error) {
	imagePath := fmt.Sprintf("%s/img.jpg", post.SrcPath)
	buffer, err := bimg.Read(imagePath)
	if err != nil {
		return "", err
	}

	newImage := bimg.NewImage(buffer)
	imageSize, _ := newImage.Size()

	dimensions := getDimensions(imageSize)

	resizedImage, err := newImage.Resize(dimensions[0], dimensions[1])
	if err != nil {
		return "", err
	}

	newImagePath := fmt.Sprintf("%s/resized.jpg", post.RenderPath)
	bimg.Write(newImagePath, resizedImage)

	return newImagePath, nil
}

func BuildRSSFeed(site *Site) error {
	now := time.Now()
	feed := &feeds.Feed{
		Title:       site.Config.Title,
		Link:        &feeds.Link{Href: "https://notoriousbfg.com"},
		Description: site.Config.Description,
		Author:      &feeds.Author{Name: "Tim White"},
		Created:     now,
	}
	var feedItems []*feeds.Item
	for _, post := range site.PublishedBlogPosts() {
		feedItems = append(feedItems, &feeds.Item{
			Title:       post.Config.Title,
			Link:        &feeds.Link{Href: fmt.Sprintf("http://notoriousbfg.com/%s", post.Config.Slug)},
			Description: post.Config.Description,
			Author:      &feeds.Author{Name: "Tim White"},
			Created:     post.Config.Published,
		})
	}
	feed.Items = feedItems
	rss, err := feed.ToRss()
	if err != nil {
		return err
	}

	newFilePath := fmt.Sprintf("../docs/rss.xml")
	fp, err := os.OpenFile(newFilePath, os.O_RDWR|os.O_CREATE|os.O_TRUNC, 0755)
	if err != nil {
		return err
	}

	fp.WriteString(rss)

	if err := fp.Close(); err != nil {
		return err
	}

	return nil
}

func truncatePublicDir() {
	dir, _ := ioutil.ReadDir("../docs")
	exclude := []string{"img", "site.css", "CNAME"}
	for _, d := range dir {
		if contains(exclude, d.Name()) {
			continue
		}
		os.RemoveAll(fmt.Sprintf("../docs/%s", d.Name()))
	}
}

func contains(s []string, e string) bool {
	for _, a := range s {
		if a == e {
			return true
		}
	}
	return false
}

func getDimensions(imageSize bimg.ImageSize) []int {
	var dimensions [2]int
	var aspectRatio int
	if imageSize.Width < imageSize.Height {
		aspectRatio = imageSize.Width / imageSize.Height
	} else if imageSize.Width > imageSize.Height {
		aspectRatio = imageSize.Height / imageSize.Width
	} else {
		aspectRatio = 1
	}
	newWidth := 1000
	newHeight := newWidth * aspectRatio
	dimensions = [...]int{newWidth, newHeight}
	return dimensions[:]
}
