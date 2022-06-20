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

func ReadPosts(site *Site) error {
	var posts []Post

	items, err := ioutil.ReadDir("../posts")
	if err != nil {
		return fmt.Errorf("error reading posts directory")
	}

	for _, item := range items {
		if item.IsDir() {
			post := Post{}
			postDirectory := fmt.Sprintf("../posts/%s", item.Name())
			subItems, err := ioutil.ReadDir(postDirectory)

			if err != nil {
				return fmt.Errorf("error reading post directory: %v", item)
			}

			for _, subItem := range subItems {
				if subItem.Name() == "config.json" {
					filePath := fmt.Sprintf("../posts/%s/config.json", item.Name())
					contents, err := ioutil.ReadFile(filePath)
					if err != nil {
						return fmt.Errorf("error reading config file: %s", filePath)
					}

					if err = json.Unmarshal([]byte(contents), &post.Config); err != nil {
						return fmt.Errorf("error unmarshalling JSON (%s): %+v\n", filePath, err)
					}
				}

				if subItem.Name() == "post.md" {
					if err := RenderContent(fmt.Sprintf("../posts/%s/post.md", item.Name()), &post, site); err != nil {
						return err
					}
				}
			}

			posts = append(posts, post)
		}
	}

	site.Posts = posts
	return nil
}

func BuildSite(site Site) error {
	truncatePublicDir()

	if err := BuildPosts(&site); err != nil {
		return err
	}

	if err := BuildHomePage(&site); err != nil {
		return err
	}

	if err := BuildArchivePage(&site); err != nil {
		return err
	}

	return nil
}

func BuildPosts(site *Site) error {
	for key, post := range site.Posts {
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

		fp.WriteString(site.Posts[key].RenderedContent)

		if err := fp.Close(); err != nil {
			return err
		}
	}

	return nil
}

func BuildHomePage(site *Site) error {
	template := template.Must(
		template.ParseFiles("./templates/home.html", "./templates/base.html"),
	)

	var content bytes.Buffer
	templateErr := template.ExecuteTemplate(&content, "base", SiteData{
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
	templateErr := template.ExecuteTemplate(&content, "base", SiteData{
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

func RenderContent(filePath string, post *Post, site *Site) error {
	contents, pathErr := ioutil.ReadFile(filePath)

	if pathErr != nil {
		return fmt.Errorf("error reading file: %s", filePath)
	}

	post.Content = string(markdown.ToHTML(contents, nil, nil))

	template := template.Must(
		template.ParseFiles("./templates/post.html", "./templates/base.html"),
	)

	var content bytes.Buffer
	templateErr := template.ExecuteTemplate(&content, "base", PostData{
		Post: *post,
		Site: *site,
	})
	if templateErr != nil {
		return fmt.Errorf("error generating template: \n%+v\n", templateErr)
	}

	post.RenderedContent = content.String()
	return nil
}

func truncatePublicDir() {
	os.RemoveAll("../docs/**/*.html")
	os.MkdirAll("../docs", os.ModePerm)
}
