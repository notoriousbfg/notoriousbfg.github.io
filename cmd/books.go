package main

import (
	"fmt"
	"html"

	"github.com/golang-module/carbon"
	"github.com/mmcdole/gofeed"
)

func GetOkuFeed() ([]*gofeed.Item, error) {
	fp := gofeed.NewParser()
	feed, err := fp.ParseURL("https://oku.club/rss/collection/hZgei")
	if err != nil {
		return []*gofeed.Item{}, err
	}
	var feedItems []*gofeed.Item
	for _, item := range feed.Items {
		item.Description = truncateText(html.UnescapeString(item.Description), 200)
		item.Published = carbon.Time2Carbon(*item.PublishedParsed).Format("jS M Y")
		feedItems = append(feedItems, item)
	}
	return feedItems, nil
}

func BuildBookRecommendations(site *Site) error {
	feedItems, err := GetOkuFeed()
	if err != nil {
		return err
	}

	site.Books = feedItems

	if buildErr := BuildFromTemplate("./templates/books.html", PageData{Site: *site}, "../docs/books"); buildErr != nil {
		return buildErr
	}

	return nil
}

func truncateText(s string, max int) string {
	if len(s) < max {
		return s
	}

	return fmt.Sprintf("%s...", s[:max])
}
