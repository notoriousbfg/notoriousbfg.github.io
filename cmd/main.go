package main

import (
	"fmt"
	"log"
	"os"
	"strconv"

	flag "github.com/ogier/pflag"
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

		readErr := ReadPosts(&site)

		if readErr != nil {
			log.Printf("there was a problem reading the posts directory:\n%+v\n", readErr)
			return
		}

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

		title := args[1]

		category := flag.String("category", "blog", "the category of the post")
		date := flag.String("date", "", "the publish date of the post")
		flag.Parse()

		if err := NewPost(title, *category, *date); err != nil {
			log.Printf("there was a problem creating a new post: %+v", err)
			return
		}
	}
}
