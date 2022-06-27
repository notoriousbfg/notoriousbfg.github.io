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

func (s Site) PublishedBlogPosts() []Post {
	return s.PublishedPosts("blog")
}

func (s Site) PublishedPhotos() []Post {
	return s.PublishedPosts("photo")
}

func (s Site) PublishedPosts(category string) []Post {
	var published []Post
	for _, post := range s.Posts {
		if !post.Config.Draft && post.Config.Category == category {
			published = append(published, post)
		}
	}
	sort.Slice(published, func(i, j int) bool {
		return published[i].Config.Published.After(published[j].Config.Published)
	})
	return published
}

func (s Site) LatestBlogPosts() []Post {
	posts := s.PublishedBlogPosts()
	var sliceLength int
	if len(posts) >= 5 {
		sliceLength = 5
	} else {
		sliceLength = len(posts)
	}
	return posts[0:sliceLength]
}

func (s Site) Categories() []string {
	categorySet := make(map[string]bool)
	for _, post := range s.Posts {
		if _, ok := categorySet[post.Config.Category]; !ok {
			categorySet[post.Config.Category] = true
		}
	}
	keys := make([]string, len(categorySet))
	i := 0
	for key := range categorySet {
		keys[i] = key
		i++
	}
	return keys
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
	SrcPath         string
	RenderPath      string
	Image           string
}

type PostConfig struct {
	Title       string
	Slug        string
	Published   time.Time
	Description string
	Category    string
	Draft       bool
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
		Category    string
		Draft       bool
	}
	err := json.Unmarshal(data, &postConfig)
	if err != nil {
		return err
	}
	pc.Title = postConfig.Title
	pc.Slug = postConfig.Slug
	pc.Description = postConfig.Description
	pc.Category = postConfig.Category
	pc.Draft = postConfig.Draft

	if len(postConfig.Published) == 0 {
		return fmt.Errorf("post \"%s\" has no publish date", postConfig.Title)
	}

	timestamp, err := time.Parse("2006-01-02", postConfig.Published)
	if err != nil {
		return err
	}

	pc.Published = timestamp
	return nil
}

func (pc *PostConfig) MarshalJSON() ([]byte, error) {
	return json.Marshal(&struct {
		Title       string `json:"title"`
		Slug        string `json:"slug"`
		Published   string `json:"published"`
		Description string `json:"description"`
		Category    string `json:"category"`
		Draft       bool   `json:"draft"`
	}{
		Title:       pc.Title,
		Slug:        pc.Slug,
		Published:   pc.Published.Format("2006-01-02"),
		Description: pc.Description,
		Category:    pc.Category,
		Draft:       pc.Draft,
	})
}

type PageData struct {
	Post Post
	Site Site
}

func (pd PageData) HasPost() bool {
	return pd.Post.Config.Title != ""
}
