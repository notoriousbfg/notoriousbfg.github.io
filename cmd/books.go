package main

import (
	"fmt"
	"html"

	"github.com/golang-module/carbon"
	"github.com/mmcdole/gofeed"
)

const (
	currentlyReadingUrl = "https://oku.club/rss/collection/wcVIL"
)

func GetOkuFeed() ([]*gofeed.Item, error) {
	fp := gofeed.NewParser()
	feed, err := fp.ParseURL(currentlyReadingUrl)
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

func truncateText(s string, max int) string {
	if len(s) < max {
		return s
	}

	return fmt.Sprintf("%s...", s[:max])
}
