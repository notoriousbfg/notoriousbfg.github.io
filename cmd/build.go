package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io/ioutil"
	"os"
	"path/filepath"
	"sync"
	"text/template"
	"time"

	"github.com/gomarkdown/markdown"
	"github.com/gomarkdown/markdown/html"
	"github.com/gorilla/feeds"
	"github.com/h2non/bimg"
	"github.com/hashicorp/go-multierror"
	ffmpeg "github.com/u2takey/ffmpeg-go"
)

func ReadPosts() ([]Post, error) {
	var posts []Post

	postsPath, _ := filepath.Abs("../posts")
	items, err := ioutil.ReadDir(postsPath)
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
						return nil, fmt.Errorf("error unmarshalling JSON (%s): %+v", filePath, err)
					}
				}
			}

			posts = append(posts, post)
		}
	}

	return posts, nil
}

func BuildSite(site *Site, nuke bool) error {
	if nuke {
		truncatePublicDir()
	}

	posts, readErr := ReadPosts()

	if readErr != nil {
		return readErr
	}

	site.Posts = posts

	var buildErr error

	if err := BuildPosts(site, nuke); err != nil {
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
		if err := BuildFeedPage(site); err != nil {
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

func BuildPosts(site *Site, nuke bool) error {
	buildCache, _ := BuildCache()

	for key, post := range site.Posts {
		checksumErr := post.MakeChecksum()
		if checksumErr != nil {
			return checksumErr
		}

		if post.Config.Draft {
			continue
		}

		var newDir string
		if post.Config.Category == "photo" || post.Config.Category == "video" {
			newDir = fmt.Sprintf("../docs/feed/%s", post.Config.Slug)
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
			renderError = RenderPhoto(&post, site, buildCache, nuke)
		case "video":
			renderError = RenderVideo(&post, site, buildCache, nuke)
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

	CachePosts(site.Posts)

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
		return fmt.Errorf("error generating template: %+v", templateErr)
	}

	newFilePath := "../docs/index.html"
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
		return fmt.Errorf("error generating template: %+v", templateErr)
	}

	err := os.MkdirAll("../docs/archive", os.ModePerm)
	if err != nil {
		return err
	}

	newFilePath := "../docs/archive/index.html"
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

func BuildFeedPage(site *Site) error {
	template := template.Must(
		template.ParseFiles("./templates/feed/feed.html", "./templates/base.html"),
	)

	var content bytes.Buffer
	templateErr := template.ExecuteTemplate(&content, "base", PageData{
		Site: *site,
	})
	if templateErr != nil {
		return fmt.Errorf("error generating template: %+v", templateErr)
	}

	err := os.MkdirAll("../docs/feed", os.ModePerm)
	if err != nil {
		return err
	}

	newFilePath := "../docs/feed/index.html"
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

	htmlFlags := html.CommonFlags | html.HrefTargetBlank
	opts := html.RendererOptions{Flags: htmlFlags}
	renderer := html.NewRenderer(opts)

	post.Content = string(markdown.ToHTML(contents, nil, renderer))

	template := template.Must(
		template.ParseFiles("./templates/post.html", "./templates/base.html"),
	)

	var content bytes.Buffer
	templateErr := template.ExecuteTemplate(&content, "base", PageData{
		Post: *post,
		Site: *site,
	})
	if templateErr != nil {
		return fmt.Errorf("error generating template: \n%+v", templateErr)
	}

	post.RenderedContent = content.String()
	return nil
}

func RenderPhoto(post *Post, site *Site, cache []CachedPost, nuke bool) error {
	if post.HasChanged(cache) || nuke {
		_, err := ResizeImage(post)
		if err != nil {
			return err
		}
	}

	postPath := fmt.Sprintf("%s/post.md", post.SrcPath)
	contents, pathErr := ioutil.ReadFile(postPath)

	if pathErr != nil {
		return fmt.Errorf("error reading file: %s", postPath)
	}

	post.Content = string(markdown.ToHTML(contents, nil, nil))
	post.Image = fmt.Sprintf("/feed/%s/resized.jpg", post.Config.Slug)

	template := template.Must(
		template.ParseFiles("./templates/feed/photo.html", "./templates/base.html"),
	)

	var content bytes.Buffer
	templateErr := template.ExecuteTemplate(&content, "base", PageData{
		Post: *post,
		Site: *site,
	})
	if templateErr != nil {
		return fmt.Errorf("error generating template: %+v", templateErr)
	}

	post.RenderedContent = content.String()
	return nil
}

func RenderVideo(post *Post, site *Site, cache []CachedPost, nuke bool) error {
	if post.HasChanged(cache) || nuke {
		_, err := CompressVideo(post)
		if err != nil {
			return err
		}
	}

	postPath := fmt.Sprintf("%s/post.md", post.SrcPath)
	contents, pathErr := ioutil.ReadFile(postPath)

	if pathErr != nil {
		return fmt.Errorf("error reading file: %s", postPath)
	}

	post.Content = string(markdown.ToHTML(contents, nil, nil))
	post.Video = fmt.Sprintf("/feed/%s/resized.mp4", post.Config.Slug)

	template := template.Must(
		template.ParseFiles("./templates/feed/video.html", "./templates/base.html"),
	)

	var content bytes.Buffer
	templateErr := template.ExecuteTemplate(&content, "base", PageData{
		Post: *post,
		Site: *site,
	})
	if templateErr != nil {
		return fmt.Errorf("error generating template: %+v", templateErr)
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

	newFilePath := "../docs/rss.xml"
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

func CompressVideo(post *Post) (string, error) {
	output := fmt.Sprintf("%s/resized.mp4", post.RenderPath)
	err := ffmpeg.Input(fmt.Sprintf("%s/video.mp4", post.SrcPath)).
		Output(output, ffmpeg.KwArgs{"vf": "scale=w=480:h=848"}).
		OverWriteOutput().
		Run()
	if err != nil {
		return "", err
	}
	return output, nil
}

func CachePosts(posts []Post) error {
	var output []CachedPost
	for _, post := range posts {
		output = append(output, CachedPost{
			Directory:   post.SrcPath,
			Checksum:    post.Checksum,
			LastUpdated: time.Now(),
		})
	}
	toWrite, _ := json.Marshal(output)
	fp, err := os.OpenFile("../build-cache.json", os.O_RDWR|os.O_CREATE|os.O_TRUNC, 0755)
	if err != nil {
		return err
	}
	fp.WriteString(string(toWrite))
	return nil
}

func BuildCache() ([]CachedPost, error) {
	jsonFile, err := os.OpenFile("../build-cache.json", os.O_RDWR, 0755)
	if err != nil {
		return nil, err
	}
	defer jsonFile.Close()
	bytes, _ := ioutil.ReadAll(jsonFile)
	if err != nil {
		return nil, err
	}
	var buildCache []CachedPost
	if err := json.Unmarshal(bytes, &buildCache); err != nil {
		return nil, err
	}
	return buildCache, nil
}

func truncatePublicDir() {
	dir, _ := ioutil.ReadDir("../docs")
	exclude := []string{"img", "site.css", "CNAME"}
	for _, d := range dir {
		if Contains(exclude, d.Name()) {
			continue
		}
		os.RemoveAll(fmt.Sprintf("../docs/%s", d.Name()))
	}
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
	newWidth := 2000
	newHeight := newWidth * aspectRatio
	dimensions = [...]int{newWidth, newHeight}
	return dimensions[:]
}
