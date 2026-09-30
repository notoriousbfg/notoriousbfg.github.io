package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/golang-module/carbon"
)

const hardcoverUserID = 50871

type CurrentBook struct {
	Title   string
	Image   string
	Authors []string
	Link    string
}

type ReadBook struct {
	Title    string
	Authors  []string
	Link     string
	Rating   float64
	Finished time.Time
}

func (b ReadBook) Byline() string {
	return strings.Join(b.Authors, ", ")
}

func (b ReadBook) FormattedDate() string {
	return carbon.Time2Carbon(b.Finished).Format("jS F")
}

// e.g. 3.5 -> ★★★½
func (b ReadBook) Stars() string {
	stars := strings.Repeat("★", int(b.Rating))
	if b.Rating-math.Floor(b.Rating) >= 0.5 {
		stars += "½"
	}
	return stars
}

var hardCoverAPIKey = os.Getenv("HARDCOVER_API_KEY")

type hardcoverResponse struct {
	Data   json.RawMessage `json:"data"`
	Errors []struct {
		Message string `json:"message"`
	} `json:"errors"`
}

type hardcoverBook struct {
	Title string `json:"title"`
	Image *struct {
		URL string `json:"url"`
	} `json:"image"`
	Contributions []struct {
		Contribution *string `json:"contribution"`
		Author       struct {
			Name string `json:"name"`
		} `json:"author"`
	} `json:"contributions"`
	Slug string `json:"slug"`
}

func (b hardcoverBook) Link() string {
	return fmt.Sprintf("https://hardcover.app/books/%s", b.Slug)
}

type hardcoverCurrentBooks struct {
	UserBooks []struct {
		Book hardcoverBook `json:"book"`
	} `json:"user_books"`
}

type hardcoverReadBooks struct {
	UserBooks []struct {
		Rating       *float64      `json:"rating"`
		LastReadDate string        `json:"last_read_date"`
		Book         hardcoverBook `json:"book"`
	} `json:"user_books"`
}

func GetCurrentHardcoverBook(ctx context.Context) (CurrentBook, error) {
	var book CurrentBook
	err := retryHardcover(ctx, func() error {
		var err error
		book, err = fetchBook(ctx)
		return err
	})
	return book, err
}

// the books finished in the given year, highest rated first
func GetHardcoverBooksRead(ctx context.Context, year int) ([]ReadBook, error) {
	var books []ReadBook
	err := retryHardcover(ctx, func() error {
		var err error
		books, err = fetchBooksRead(ctx, year)
		return err
	})
	return books, err
}

func retryHardcover(ctx context.Context, fetch func() error) error {
	const maxAttempts = 3
	backoff := 200 * time.Millisecond

	var lastErr error

	for attempt := 1; attempt <= maxAttempts; attempt++ {
		err := fetch()
		if err == nil {
			return nil
		}
		lastErr = err

		if attempt < maxAttempts {
			select {
			case <-time.After(backoff):
				backoff *= 2
			case <-ctx.Done():
				return ctx.Err()
			}
		}
	}

	return fmt.Errorf("failed after %d attempts: %w", maxAttempts, lastErr)
}

func queryHardcover(ctx context.Context, query string, variables map[string]interface{}, data interface{}) error {
	payload := map[string]interface{}{
		"query":     query,
		"variables": variables,
	}

	bodyBytes, _ := json.Marshal(payload)
	req, err := http.NewRequestWithContext(ctx, "POST", "https://api.hardcover.app/v1/graphql", bytes.NewReader(bodyBytes))
	if err != nil {
		return err
	}

	req.Header.Set("Authorization", "Bearer "+hardCoverAPIKey)
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("hardcover API returned status %d", resp.StatusCode)
	}

	var hcResp hardcoverResponse
	if err := json.NewDecoder(resp.Body).Decode(&hcResp); err != nil {
		return fmt.Errorf("decode response: %w", err)
	}

	if len(hcResp.Errors) > 0 {
		return fmt.Errorf("graphql error: %s", hcResp.Errors[0].Message)
	}

	if err := json.Unmarshal(hcResp.Data, data); err != nil {
		return fmt.Errorf("decode response data: %w", err)
	}

	return nil
}

func fetchBook(ctx context.Context) (CurrentBook, error) {
	query := `
query GetUserBooks($user_id: Int!) {
	user_books(where: {user_id: {_eq: $user_id}, status_id: {_eq: 2}}) {
		book {
			title
			image { url }
			contributions { author { name } }
			slug
		}
	}
}`

	var data hardcoverCurrentBooks
	err := queryHardcover(ctx, query, map[string]interface{}{
		"user_id": hardcoverUserID,
	}, &data)
	if err != nil {
		return CurrentBook{}, err
	}

	if len(data.UserBooks) == 0 {
		return CurrentBook{}, nil
	}

	first := data.UserBooks[0].Book
	authors := make([]string, 0, len(first.Contributions))
	for _, c := range first.Contributions {
		authors = append(authors, c.Author.Name)
	}

	imageURL := ""
	if first.Image != nil {
		imageURL = first.Image.URL
	}

	return CurrentBook{
		Title:   first.Title,
		Image:   imageURL,
		Authors: authors,
		Link:    first.Link(),
	}, nil
}

func fetchBooksRead(ctx context.Context, year int) ([]ReadBook, error) {
	// status 3 is "read", privacy setting 1 is "public"
	query := `
query GetBooksRead($user_id: Int!, $from: date!, $to: date!) {
	user_books(
		where: {
			user_id: {_eq: $user_id},
			status_id: {_eq: 3},
			privacy_setting_id: {_eq: 1},
			last_read_date: {_gte: $from, _lt: $to}
		},
		order_by: [{rating: desc_nulls_last}, {last_read_date: desc}]
	) {
		rating
		last_read_date
		book {
			title
			contributions { contribution author { name } }
			slug
		}
	}
}`

	var data hardcoverReadBooks
	err := queryHardcover(ctx, query, map[string]interface{}{
		"user_id": hardcoverUserID,
		"from":    fmt.Sprintf("%d-01-01", year),
		"to":      fmt.Sprintf("%d-01-01", year+1),
	}, &data)
	if err != nil {
		return nil, err
	}

	books := make([]ReadBook, 0, len(data.UserBooks))
	for _, userBook := range data.UserBooks {
		finished, err := time.ParseInLocation("2006-01-02", userBook.LastReadDate, time.Local)
		if err != nil {
			return nil, fmt.Errorf("parse read date for \"%s\": %w", userBook.Book.Title, err)
		}

		book := ReadBook{
			Title:    userBook.Book.Title,
			Authors:  bookAuthors(userBook.Book),
			Link:     userBook.Book.Link(),
			Finished: finished,
		}
		if userBook.Rating != nil {
			book.Rating = *userBook.Rating
		}
		books = append(books, book)
	}

	return books, nil
}

// contributions also include illustrators, translators etc.
func bookAuthors(book hardcoverBook) []string {
	var authors []string
	for _, c := range book.Contributions {
		if c.Contribution != nil && *c.Contribution != "" && *c.Contribution != "Author" {
			continue
		}
		if c.Author.Name == "Unknown Author" {
			continue
		}
		authors = append(authors, c.Author.Name)
	}
	return authors
}

func truncateText(s string, max int) string {
	if len(s) < max {
		return s
	}

	return fmt.Sprintf("%s...", s[:max])
}
