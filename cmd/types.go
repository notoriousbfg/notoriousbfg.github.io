package main

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"sort"
	"time"

	"github.com/golang-module/carbon"
	"github.com/mmcdole/gofeed"
)

type Site struct {
	Config SiteConfig
	Posts  []Post
	Books  []*gofeed.Item
}

func (s Site) PublishedBlogPosts() []Post {
	return s.PublishedPosts([]string{"blog"})
}

func (s Site) PublishedFeed() []Post {
	return s.PublishedPosts([]string{"photo", "video"})
}

func (s Site) PublishedPosts(categories []string) []Post {
	var published []Post
	for _, post := range s.Posts {
		if !post.Config.Draft && Contains(categories, post.Config.Category) {
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
	Version     string
}

type Post struct {
	Config          PostConfig
	Content         string
	RenderedContent string
	SrcPath         string
	RenderPath      string
	Checksum        string
	Images          []string
	Video           string
}

func (p *Post) MakeChecksum() error {
	f, err := os.Open(p.SrcFile())
	if err != nil {
		return err
	}
	defer f.Close()
	h := sha256.New()
	if _, err := io.Copy(h, f); err != nil {
		return err
	}
	p.Checksum = hex.EncodeToString(h.Sum(nil))
	return nil
}

func (p *Post) HasChanged(cache []CachedPost) bool {
	var thisPost CachedPost
	for _, cachedPost := range cache {
		if cachedPost.Directory == p.SrcPath {
			thisPost = cachedPost
			break
		}
	}
	if thisPost.Directory == "" {
		return true
	} else {
		return thisPost.Checksum != p.Checksum
	}
}

func (p Post) SrcFile() string {
	var inputFile string
	if p.Config.Category == "blog" {
		inputFile = fmt.Sprintf("%s/post.md", p.SrcPath)
	} else if p.Config.Category == "photo" {
		inputFile = fmt.Sprintf("%s/img.jpg", p.SrcPath)
	} else if p.Config.Category == "video" {
		inputFile = fmt.Sprintf("%s/video.mp4", p.SrcPath)
	}
	return inputFile
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

type CachedPost struct {
	Directory   string    `json:"directory"`
	Checksum    string    `json:"checksum"`
	LastUpdated time.Time `json:"last-updated"`
}
