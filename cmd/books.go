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

	// template := template.Must(
	// 	template.ParseFiles("./templates/books.html", "./templates/base.html"),
	// )

	// var content bytes.Buffer
	// templateErr := template.ExecuteTemplate(&content, "base", PageData{
	// 	Site: *site,
	// })
	// if templateErr != nil {
	// 	return fmt.Errorf("error generating template: \n%+v\n", templateErr)
	// }

	// dirErr := os.MkdirAll("../docs/books", os.ModePerm)
	// if dirErr != nil {
	// 	return dirErr
	// }

	// newFilePath := fmt.Sprintf("../docs/books/index.html")
	// fp, err := os.OpenFile(newFilePath, os.O_RDWR|os.O_CREATE|os.O_TRUNC, 0755)
	// if err != nil {
	// 	return err
	// }

	if buildErr := buildFromTemplate("./templates/books.html", PageData{Site: *site}, "../docs/books"); buildErr != nil {
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
