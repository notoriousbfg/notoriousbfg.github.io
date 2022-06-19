package main

import (
	"fmt"
	"log"
	"os"
	"strconv"
)

func main() {
	args := os.Args[1:]

	if len(args) == 0 {
		panic("not enough arguments passed to cli")
	}

	if args[0] == "build" {
		site := Site{
			Config: SiteConfig{
				Title:       "Tim's Blog",
				Description: "The personal blog of Tim White, Software Developer from Bournemouth.",
				Bio:         "I’m Tim, a Software Developer from the UK. I like to program, cook, read & run.",
			},
		}

		posts, readErr := ReadPosts()

		if readErr != nil {
			log.Printf("there was a problem reading the posts directory:\n%+v\n", readErr)
			return
		}

		site.Posts = posts

		buildErr := BuildSite(site)

		if buildErr != nil {
			log.Printf("there was a problem building the site: %+v", buildErr)
			return
		}

		fmt.Printf("blog built. posts written: %s\n", strconv.Itoa(len(site.Posts)))
	}

	if args[0] == "new" {
		if len(args) == 1 {
			log.Printf("you must specify a post title")
			return
		}

		if err := NewPost(args[1]); err != nil {
			log.Printf("there was a problem creating a new post: %+v", err)
			return
		}
	}
}
