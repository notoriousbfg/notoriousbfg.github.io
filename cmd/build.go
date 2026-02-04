package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"text/template"
	"time"

	"github.com/gomarkdown/markdown"
	"github.com/gomarkdown/markdown/html"
	"github.com/gomarkdown/markdown/parser"
	"github.com/gorilla/feeds"
	"github.com/h2non/bimg"
	"github.com/hashicorp/go-multierror"
)

type Cache struct {
	Version string       `json:"version"`
	Posts   []CachedPost `json:"posts"`
}

func ReadPosts() ([]Post, error) {
	var posts []Post

	postsPath, _ := filepath.Abs("../posts")
	items, err := os.ReadDir(postsPath)
	if err != nil {
		return nil, fmt.Errorf("error reading posts directory")
	}

	for _, item := range items {
		if item.IsDir() {
			post := Post{
				SrcPath: fmt.Sprintf("../posts/%s", item.Name()),
			}

			subItems, err := os.ReadDir(post.SrcPath)

			if err != nil {
				return nil, fmt.Errorf("error reading post directory: %v", item)
			}

			for _, subItem := range subItems {
				if subItem.Name() == "config.json" {
					filePath := fmt.Sprintf("%s/config.json", post.SrcPath)
					contents, err := os.ReadFile(filePath)
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

func BuildSite(site *Site, nuke bool, buildDraftPosts bool) error {
	if nuke {
		truncatePublicDir()
	}

	posts, readErr := ReadPosts()

	if readErr != nil {
		return readErr
	}

	site.Posts = posts

	var buildErr error

	// parse jam file & add to site config
	if err := ReadJam(site); err != nil {
		buildErr = multierror.Append(buildErr, err)
	}

	if err := BuildPosts(site, nuke, buildDraftPosts); err != nil {
		buildErr = multierror.Append(buildErr, err)
	}

	if err := BuildHomePage(site); err != nil {
		buildErr = multierror.Append(buildErr, err)
	}

	var wg sync.WaitGroup
	wg.Add(5)

	go func() {
		defer wg.Done()
		if err := BuildArchivePage(site); err != nil {
			buildErr = multierror.Append(buildErr, err)
		}
	}()

	go func() {
		defer wg.Done()
		if err := BuildAboutPage(site); err != nil {
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
		if err := BuildAboutPage(site); err != nil {
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

func BuildPosts(site *Site, nuke bool, buildDraft bool) error {
	buildCache, _ := BuildCache()

	for key, post := range site.Posts {
		checksumErr := post.MakeChecksum()
		if checksumErr != nil {
			return fmt.Errorf("there was a problem with making the checksum for post '%s': %s", post.Config.Title, checksumErr.Error())
		}

		if post.Config.Draft && !buildDraft {
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
			return fmt.Errorf("there was a problem with making the post directory '%s': %s", post.Config.Title, err.Error())
		}

		post.RenderPath = newDir

		newFilePath := fmt.Sprintf("%s/index.html", newDir)
		fp, err := os.OpenFile(newFilePath, os.O_RDWR|os.O_CREATE|os.O_TRUNC, 0755)
		if err != nil {
			return fmt.Errorf("there was a problem opening the post index.html '%s': %s", post.Config.Title, err.Error())
		}

		var imageMap map[string]string
		imageMap, err = ResizeImages(&post, buildCache, nuke)
		if err != nil {
			return fmt.Errorf("there was a problem resizing the post images '%s': %s", post.Config.Title, err.Error())
		}

		var renderError error
		switch post.Config.Category {
		case "photo":
			renderError = RenderPhoto(&post, site)
		case "video":
			renderError = RenderVideo(&post, site, buildCache, nuke)
		case "blog":
			renderError = RenderPost(&post, site, imageMap)
		}

		if renderError != nil {
			return fmt.Errorf("there was a problem rendering the %s '%s': %s", post.Config.Category, post.Config.Title, renderError.Error())
		}

		fp.WriteString(post.RenderedContent)

		if err := fp.Close(); err != nil {
			return err
		}

		site.Posts[key] = post
	}

	CachePosts(site)

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

	err := os.MkdirAll("../docs/essays", os.ModePerm)
	if err != nil {
		return err
	}

	newFilePath := "../docs/essays/index.html"
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

func BuildAboutPage(site *Site) error {
	template := template.Must(
		template.ParseFiles("./templates/about.html", "./templates/base.html"),
	)

	currentBook, err := GetCurrentHardcoverBook(context.Background())
	if err != nil {
		return err
	}
	site.CurrentBook = currentBook

	var content bytes.Buffer
	templateErr := template.ExecuteTemplate(&content, "base", PageData{
		Site: *site,
	})
	if templateErr != nil {
		return fmt.Errorf("error generating template: %+v", templateErr)
	}

	err = os.MkdirAll("../docs/about", os.ModePerm)
	if err != nil {
		return err
	}

	newFilePath := "../docs/about/index.html"
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

func RenderPost(post *Post, site *Site, imageMap map[string]string) error {
	postPath := fmt.Sprintf("%s/post.md", post.SrcPath)
	contents, pathErr := os.ReadFile(postPath)

	if pathErr != nil {
		return fmt.Errorf("error reading file: %s", postPath)
	}

	htmlFlags := html.CommonFlags | html.HrefTargetBlank
	extensions := parser.Footnotes
	parser := parser.NewWithExtensions(extensions)
	opts := html.RendererOptions{Flags: htmlFlags}
	renderer := html.NewRenderer(opts)

	postContent := string(markdown.ToHTML(contents, parser, renderer))
	cleanHTML, err := replaceImagePaths(postContent, imageMap)
	if err != nil {
		return err
	}
	post.Content = cleanHTML

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

func RenderPhoto(post *Post, site *Site) error {
	postPath := fmt.Sprintf("%s/post.md", post.SrcPath)
	contents, pathErr := os.ReadFile(postPath)

	if pathErr != nil {
		return fmt.Errorf("error reading file: %s", postPath)
	}

	post.Content = string(markdown.ToHTML(contents, nil, nil))

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

func RenderVideo(post *Post, site *Site, cache Cache, nuke bool) error {
	if post.HasChanged(cache.Posts) || nuke {
		_, err := CompressVideo(post)
		if err != nil {
			return err
		}
	}

	postPath := fmt.Sprintf("%s/post.md", post.SrcPath)
	contents, pathErr := os.ReadFile(postPath)

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

func ResizeImages(post *Post, cache Cache, nuke bool) (map[string]string, error) {
	files, err := os.ReadDir(post.SrcPath)
	if err != nil {
		return map[string]string{}, err
	}

	var newImagePaths []string
	var count int = 0
	imageMap := make(map[string]string, 0)

	for _, file := range files {
		filename := file.Name()
		ext := filepath.Ext(filename) // returns the "."
		if Contains(allowedImageExtensions, ext) {
			count++

			if post.HasChanged(cache.Posts) || nuke {
				imagePath := fmt.Sprintf("%s/%s", post.SrcPath, file.Name())
				buffer, err := bimg.Read(imagePath)
				if err != nil {
					return map[string]string{}, err
				}

				newImage := bimg.NewImage(buffer)
				imageSize, _ := newImage.Size()

				dimensions := getDimensions(imageSize)
				resizedImage, err := newImage.Resize(dimensions[0], dimensions[1])
				if err != nil {
					return map[string]string{}, err
				}

				newImagePath := fmt.Sprintf("%s/%d.jpg", post.RenderPath, count)
				bimg.Write(newImagePath, resizedImage)
			}

			var newSrcPath string
			if post.Config.Category == "photo" {
				newSrcPath = fmt.Sprintf("/feed/%s/%d.jpg", post.Config.Slug, count)
			} else {
				newSrcPath = fmt.Sprintf("/%s/%d.jpg", post.Config.Slug, count)
			}
			newImagePaths = append(newImagePaths, newSrcPath)

			imageMapKey := fmt.Sprintf("./%s", filename)
			imageMap[imageMapKey] = newSrcPath
		}
	}

	post.Images = newImagePaths
	return imageMap, nil
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

func ReadJam(site *Site) error {
	jsonFile, err := os.OpenFile("../jam.json", os.O_RDWR, 0755)
	if err != nil {
		return err
	}
	defer jsonFile.Close()
	bytes, _ := io.ReadAll(jsonFile)
	if err != nil {
		return err
	}
	var track Track
	if err := json.Unmarshal(bytes, &track); err != nil {
		return err
	}
	site.Config.Player = track
	return nil
}

func CompressVideo(post *Post) (string, error) {
	// output := fmt.Sprintf("%s/resized.mp4", post.RenderPath)
	// err := ffmpeg.Input(fmt.Sprintf("%s/video.mp4", post.SrcPath)).
	// 	Output(output, ffmpeg.KwArgs{"vf": "scale=w=480:h=848"}).
	// 	OverWriteOutput().
	// 	Run()
	// if err != nil {
	// 	return "", err
	// }

	output := fmt.Sprintf("%s/resized.mp4", post.RenderPath)
	err := copyFile(fmt.Sprintf("%s/video.mp4", post.SrcPath), output)
	if err != nil {
		return "", err
	}

	return output, nil
}

func CachePosts(site *Site) error {
	cache := &Cache{
		Version: site.Version(),
	}
	for _, post := range site.Posts {
		cache.Posts = append(cache.Posts, CachedPost{
			Directory:   post.SrcPath,
			Checksum:    post.Checksum,
			LastUpdated: time.Now(),
		})
	}
	toWrite, _ := json.Marshal(cache)
	fp, err := os.OpenFile("../build-cache.json", os.O_RDWR|os.O_CREATE|os.O_TRUNC, 0755)
	if err != nil {
		return err
	}
	fp.WriteString(string(toWrite))
	return nil
}

func BuildCache() (Cache, error) {
	jsonFile, err := os.OpenFile("../build-cache.json", os.O_RDWR, 0755)
	if err != nil {
		return Cache{}, err
	}
	defer jsonFile.Close()
	bytes, _ := io.ReadAll(jsonFile)
	if err != nil {
		return Cache{}, err
	}
	var buildCache Cache
	if err := json.Unmarshal(bytes, &buildCache); err != nil {
		return Cache{}, err
	}
	return buildCache, nil
}

func truncatePublicDir() {
	dir, _ := os.ReadDir("../docs")
	exclude := []string{"img", "site.css", "me.jpg", "CNAME", "human.png", "app.js"}
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
	newWidth := 1000
	newHeight := newWidth * aspectRatio
	dimensions = [...]int{newWidth, newHeight}
	return dimensions[:]
}

func replaceImagePaths(html string, imageMap map[string]string) (string, error) {
	// e.g. "./my-image.jpeg" -> "/post-slug/1.jpg"
	for src, pub := range imageMap {
		html = strings.Replace(html, src, pub, -1)
	}
	return html, nil
}

func copyFile(src, dst string) error {
	sourceFile, err := os.Open(src)
	if err != nil {
		return err
	}
	defer sourceFile.Close()

	destinationFile, err := os.Create(dst)
	if err != nil {
		return err
	}
	defer destinationFile.Close()

	_, err = io.Copy(destinationFile, sourceFile)
	if err != nil {
		return err
	}

	return nil
}
