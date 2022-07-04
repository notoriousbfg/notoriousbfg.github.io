package main

import (
	"github.com/mmcdole/gofeed"
)

func GetOkuFeed() ([]*gofeed.Item, error) {
	fp := gofeed.NewParser()
	feed, err := fp.ParseURL("https://oku.club/rss/collection/hZgei")
	if err != nil {
		return []*gofeed.Item{}, err
	}
	return feed.Items, nil
}

func BuildBookRecommendations(site *Site) error {
	// feedItems, err := GetOkuFeed()

	// if err != nil {
	// 	return err
	// }

	// TODO: render template

	return nil
}
