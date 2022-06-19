package main

import (
	"encoding/json"
	"fmt"
	"sort"
	"time"

	"github.com/golang-module/carbon"
)

type Site struct {
	Config SiteConfig
	Posts  []Post
}

func (s *Site) OrderedPosts() []Post {
	posts := s.Posts
	sort.Slice(posts, func(i, j int) bool {
		return posts[i].Config.Published.Before(posts[j].Config.Published)
	})
	return posts
}

func (s *Site) FirstPost() Post {
	return s.OrderedPosts()[0]
}

func (s *Site) LatestPosts() []Post {
	posts := s.OrderedPosts()[1:]
	var sliceLength int
	if len(posts) >= 5 {
		sliceLength = 5
	} else {
		sliceLength = len(posts)
	}
	return posts[0:sliceLength]
}

type SiteConfig struct {
	Title       string
	Description string
	Bio         string
}

type Post struct {
	Config          PostConfig
	Content         string
	RenderedContent string
}

type PostConfig struct {
	Title       string
	Slug        string
	Published   time.Time
	Description string
	Category    string
}

func (pc PostConfig) FormattedDate() string {
	return carbon.Time2Carbon(pc.Published).Format("jS F, Y")
}

func (pc *PostConfig) UnmarshalJSON(data []byte) error {
	var postConfig struct {
		Title       string
		Slug        string
		Published   string
		Description string
	}
	err := json.Unmarshal(data, &postConfig)
	if err != nil {
		return err
	}
	pc.Title = postConfig.Title
	pc.Slug = postConfig.Slug

	if len(postConfig.Published) == 0 {
		return fmt.Errorf("post \"%s\" has no publish date", postConfig.Title)
	}

	timestamp, err := time.Parse("2006-01-02", postConfig.Published)
	if err != nil {
		return err
	}

	pc.Published = timestamp
	pc.Description = postConfig.Description
	return nil
}

func (pc *PostConfig) MarshalJSON() ([]byte, error) {
	return json.Marshal(&struct {
		Title       string `json:"title"`
		Slug        string `json:"slug"`
		Published   string `json:"published"`
		Description string `json:"description"`
		Category    string `json:"category"`
	}{
		Title:       pc.Title,
		Slug:        pc.Slug,
		Published:   pc.Published.Format("2006-01-02"),
		Description: pc.Description,
		Category:    pc.Category,
	})
}
