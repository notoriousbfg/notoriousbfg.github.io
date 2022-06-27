package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io/ioutil"
	"os"
	"text/template"

	"github.com/gomarkdown/markdown"
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
				Path: fmt.Sprintf("../posts/%s", item.Name()),
			}

			subItems, err := ioutil.ReadDir(post.Path)

			if err != nil {
				return nil, fmt.Errorf("error reading post directory: %v", item)
			}

			for _, subItem := range subItems {
				if subItem.Name() == "config.json" {
					filePath := fmt.Sprintf("%s/config.json", post.Path)
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

	if err := BuildPosts(site); err != nil {
		return err
	}

	if err := BuildHomePage(site); err != nil {
		return err
	}

	if err := BuildArchivePage(site); err != nil {
		return err
	}

	return nil
}

func BuildPosts(site *Site) error {
	posts, readErr := ReadPosts()

	if readErr != nil {
		return readErr
	}

	site.Posts = posts

	for key, post := range site.Posts {
		if post.Config.Draft {
			continue
		}

		newDir := fmt.Sprintf("../docs/%s", post.Config.Slug)
		err := os.MkdirAll(newDir, os.ModePerm)
		if err != nil {
			return err
		}

		newFilePath := fmt.Sprintf("%s/index.html", newDir)
		fp, err := os.OpenFile(newFilePath, os.O_RDWR|os.O_CREATE|os.O_TRUNC, 0755)
		if err != nil {
			return err
		}

		if post.Config.Category == "photo" {
			if photoErr := BuildImage(&post); photoErr != nil {
				return photoErr
			}
		}

		if renderError := RenderContent(&post, site); renderError != nil {
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

func RenderContent(post *Post, site *Site) error {
	postPath := fmt.Sprintf("%s/post.md", post.Path)
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

func BuildImage(post *Post) error {
	imagePath := fmt.Sprintf("%s/img.jpg", post.Path)

	return nil
}

func truncatePublicDir() {
	dir, _ := ioutil.ReadDir("../docs")
	exclude := []string{"img", "site.css"}
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
