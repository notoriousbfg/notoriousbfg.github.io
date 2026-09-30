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
	Title       string
	Image       string
	ImageWidth  int
	ImageHeight int
	Authors     []string
	Link        string
	Started     time.Time
	Description string
}

func (b CurrentBook) Byline() string {
	return strings.Join(b.Authors, ", ")
}

// the year is only worth mentioning if the book was started in a previous one
func (b CurrentBook) FormattedStarted() string {
	format := "jS F"
	if b.Started.Year() != time.Now().Year() {
		format = "jS F, Y"
	}
	return carbon.Time2Carbon(b.Started).Format(format)
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

type hardcoverImage struct {
	URL    string `json:"url"`
	Width  int    `json:"width"`
	Height int    `json:"height"`
}

type hardcoverBook struct {
	Title         string          `json:"title"`
	Description   string          `json:"description"`
	Image         *hardcoverImage `json:"image"`
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
		FirstStartedDate *string `json:"first_started_reading_date"`
		Reads            []struct {
			StartedAt *string `json:"started_at"`
		} `json:"user_book_reads"`
		Edition *struct {
			Image *hardcoverImage `json:"image"`
		} `json:"edition"`
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
	books, err := GetCurrentHardcoverBooks(ctx)
	if err != nil || len(books) == 0 {
		return CurrentBook{}, err
	}
	return books[0], nil
}

// the books being read at the moment, most recently started first
func GetCurrentHardcoverBooks(ctx context.Context) ([]CurrentBook, error) {
	var books []CurrentBook
	err := retryHardcover(ctx, func() error {
		var err error
		books, err = fetchCurrentBooks(ctx)
		return err
	})
	return books, err
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

func fetchCurrentBooks(ctx context.Context) ([]CurrentBook, error) {
	// status 2 is "currently reading", privacy setting 1 is "public"
	query := `
query GetCurrentBooks($user_id: Int!) {
	user_books(
		where: {
			user_id: {_eq: $user_id},
			status_id: {_eq: 2},
			privacy_setting_id: {_eq: 1}
		},
		order_by: {first_started_reading_date: desc_nulls_last}
	) {
		first_started_reading_date
		user_book_reads(
			where: {finished_at: {_is_null: true}},
			order_by: {started_at: desc_nulls_last},
			limit: 1
		) {
			started_at
		}
		edition {
			image { url width height }
		}
		book {
			title
			description
			image { url width height }
			contributions { contribution author { name } }
			slug
		}
	}
}`

	var data hardcoverCurrentBooks
	err := queryHardcover(ctx, query, map[string]interface{}{
		"user_id": hardcoverUserID,
	}, &data)
	if err != nil {
		return nil, err
	}

	books := make([]CurrentBook, 0, len(data.UserBooks))
	for _, userBook := range data.UserBooks {
		book := CurrentBook{
			Title:       userBook.Book.Title,
			Authors:     bookAuthors(userBook.Book),
			Link:        userBook.Book.Link(),
			Description: strings.TrimSpace(userBook.Book.Description),
		}

		// the cover of the edition being read, if it has one
		image := userBook.Book.Image
		if userBook.Edition != nil && userBook.Edition.Image != nil {
			image = userBook.Edition.Image
		}
		if image != nil {
			book.Image = image.URL
			book.ImageWidth = image.Width
			book.ImageHeight = image.Height
		}

		// a re-read starts later than the date the book was first started
		started := userBook.FirstStartedDate
		if len(userBook.Reads) > 0 && userBook.Reads[0].StartedAt != nil {
			started = userBook.Reads[0].StartedAt
		}
		if started != nil {
			book.Started, err = time.ParseInLocation("2006-01-02", *started, time.Local)
			if err != nil {
				return nil, fmt.Errorf("parse started date for \"%s\": %w", book.Title, err)
			}
		}

		books = append(books, book)
	}

	return books, nil
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
