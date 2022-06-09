package main

import (
	"encoding/json"
	"fmt"
	"io/ioutil"

	"github.com/gomarkdown/markdown"
)

type Post struct {
	Config  PostConfig
	Content []byte
}

type PostConfig struct {
	Title       string
	Slug        string
	Description string
}

func main() {
	posts := readPostsDirectory()

	for _, post := range posts {
		fmt.Println(post.Config.Title)
	}
}

func readPostsDirectory() ([]Post, error) {
	var posts []Post

	items, err := ioutil.ReadDir("../posts")

	if err != nil {
		return nil, fmt.Errorf("error reading posts directory")
	}

	for _, item := range items {
		if item.IsDir() {
			postDirectory := fmt.Sprintf("../posts/%s", item.Name())
			subItems, err := ioutil.ReadDir(postDirectory)

			if err != nil {
				return nil, fmt.Errorf("error reading post directory: %v", item)
			}

			for _, subItem := range subItems {
				post := Post{}

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
				}

				posts = append(posts, post)
			}
		}
	}

	return posts, nil
}
