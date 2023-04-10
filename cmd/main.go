package main

import (
	"fmt"
	"log"
	"os"
	"strconv"

	flag "github.com/ogier/pflag"
)

var (
	site = Site{
		Config: SiteConfig{
			Title:       "Tim's Blog",
			Description: "The personal blog of Tim White, Software Developer from Bournemouth.",
			Bio:         "I’m Tim, a Software Developer from the UK. I like to program, cook, read & run.",
		},
	}
)

func main() {
	args := os.Args[1:]

	if len(args) == 0 {
		panic("not enough arguments passed to cli")
	}

	if args[0] == "build" {
		nuke := flag.Bool("nuke", false, "whether to truncate docs directory")
		flag.Parse()

		buildErr := BuildSite(&site, *nuke, false)

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
		draft := flag.Bool("draft", false, "whether the post is a draft")
		flag.Parse()

		if err := NewPost(title, *category, *date, *draft); err != nil {
			log.Printf("there was a problem creating a new post: %+v", err)
			return
		}
	}

	if args[0] == "jam" {
		if len(args) == 1 {
			log.Printf("you must specify a song title")
			return
		}

		title := args[1]

		if err := NewJam(title); err != nil {
			log.Printf("there was a problem creating a new jam: %+v", err)
			return
		}
	}

	if args[0] == "serve" {
		StartServer()
	}
}
