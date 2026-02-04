package main

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"time"

	graphql "github.com/hasura/go-graphql-client"
)

type CurrentBook struct {
	Title string
}

var hardCoverAPIKey = os.Getenv("HARDOVER_API_KEY")

type UserBooksQuery struct {
	UserBooks []struct {
		Book struct {
			Title string
			Image *struct {
				URL string
			}
			Contributions []struct {
				Author struct {
					Name string
				}
			}
		}
	} `graphql:"user_books(where: {user_id: {_eq: $user_id}, status_id: {_eq: 2}})"`
}

func GetCurrentHardoverBook(ctx context.Context) (CurrentBook, error) {
	booksQuery := UserBooksQuery{}
	variables := map[string]interface{}{
		"user_id": 50871,
	}

	err := authenticatedRequestWithRetries(ctx,
		"https://api.hardcover.app/v1/graphql",
		&booksQuery,
		variables,
	)
	if err != nil {
		return CurrentBook{}, fmt.Errorf("hardcover request failed: %w", err)
	}

	if len(booksQuery.UserBooks) > 0 {
		firstBook := booksQuery.UserBooks[0]
		return CurrentBook{Title: firstBook.Book.Title}, nil
	}

	return CurrentBook{}, nil
}

type roundTripperWithAuth struct {
	token string
}

func (r roundTripperWithAuth) RoundTrip(req *http.Request) (*http.Response, error) {
	req.Header.Set("Authorization", "Bearer "+r.token)
	return http.DefaultTransport.RoundTrip(req)
}

func authenticatedRequestWithRetries(
	ctx context.Context,
	endpoint string,
	query interface{},
	variables map[string]interface{},
) error {

	httpClient := &http.Client{
		Transport: roundTripperWithAuth{
			token: hardCoverAPIKey,
		},
	}

	client := graphql.NewClient(endpoint, httpClient)

	const maxAttempts = 3
	backoff := 200 * time.Millisecond

	var lastErr error

	for attempt := 1; attempt <= maxAttempts; attempt++ {
		err := client.Query(ctx, &query, variables)
		if err == nil {
			return nil
		}

		lastErr = err

		// Don’t sleep after final attempt
		if attempt == maxAttempts {
			break
		}

		select {
		case <-time.After(backoff):
			backoff *= 2
		case <-ctx.Done():
			return ctx.Err()
		}
	}

	return fmt.Errorf("graphql request failed after %d attempts: %w", maxAttempts, lastErr)
}

func truncateText(s string, max int) string {
	if len(s) < max {
		return s
	}

	return fmt.Sprintf("%s...", s[:max])
}
