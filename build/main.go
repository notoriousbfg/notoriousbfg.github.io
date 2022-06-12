package main

import (
	"encoding/json"
	"fmt"
	"io/ioutil"
	"log"
	"os"
	"strconv"

	"github.com/gomarkdown/markdown"
)

type Post struct {
	Config          PostConfig
	Content         []byte
	RenderedContent string
}

type PostConfig struct {
	Title       string
	Slug        string
	Description string
}

func main() {
	args := os.Args[1:]

	if len(args) == 0 {
		panic("not enough arguments passed to cli")
	}

	if args[0] == "build" {
		posts, readErr := ReadPosts()

		if readErr != nil {
			log.Printf("there was a problem reading the posts directory: %+v", readErr)
			panic(readErr)
		}

		postCount, buildErr := BuildSite(posts)

		if buildErr != nil {
			log.Printf("there was a problem building the site: %+v", buildErr)
			panic(buildErr)
		}

		fmt.Printf("blog built. posts written: %s\n", strconv.Itoa(postCount))
	}
}

func ReadPosts() ([]Post, error) {
	var posts []Post

	templateHTML := `
		<!DOCTYPE html>
		<html>
			<head>
				<title>Hello World</title>
			</head>
			<body>
				<div class="page-content">%s</div>
			</body>
		</html>`

	items, err := ioutil.ReadDir("../posts")
	if err != nil {
		return nil, fmt.Errorf("error reading posts directory")
	}

	for _, item := range items {
		if item.IsDir() {
			post := Post{}
			postDirectory := fmt.Sprintf("../posts/%s", item.Name())
			subItems, err := ioutil.ReadDir(postDirectory)

			if err != nil {
				return nil, fmt.Errorf("error reading post directory: %v", item)
			}

			for _, subItem := range subItems {
				if subItem.Name() == "config.json" {
					filePath := fmt.Sprintf("../posts/%s/config.json", item.Name())
					contents, err := ioutil.ReadFile(filePath)

					if err != nil {
						return nil, fmt.Errorf("error reading config file: %s", filePath)
					}

					err = json.Unmarshal([]byte(contents), &post.Config)

					if err != nil {
						return nil, fmt.Errorf("error unmarshalling JSON: %s", filePath)
					}
				}

				if subItem.Name() == "post.md" {
					filePath := fmt.Sprintf("../posts/%s/post.md", item.Name())
					contents, err := ioutil.ReadFile(filePath)

					if err != nil {
						return nil, fmt.Errorf("error reading config file: %s", filePath)
					}

					md := []byte(contents)
					post.Content = markdown.ToHTML(md, nil, nil)
					post.RenderedContent = fmt.Sprintf(templateHTML, string(post.Content))
				}
			}

			posts = append(posts, post)
		}
	}

	return posts, nil
}

func BuildSite(posts []Post) (int, error) {
	truncatePublicDir()

	for key, post := range posts {
		newDir := fmt.Sprintf("../public/%s", post.Config.Slug)
		err := os.MkdirAll(newDir, os.ModePerm)
		if err != nil {
			return 0, err
		}

		newFilePath := fmt.Sprintf("%s/index.html", newDir)
		fp, err := os.OpenFile(newFilePath, os.O_RDWR|os.O_CREATE|os.O_TRUNC, 0755)
		if err != nil {
			return 0, err
		}

		fp.WriteString(posts[key].RenderedContent)

		if err := fp.Close(); err != nil {
			return 0, err
		}
	}

	return len(posts), nil
}

func truncatePublicDir() {
	os.RemoveAll("../public")
	os.MkdirAll("../public", os.ModePerm)
}
