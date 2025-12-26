package handler

import (
	"context"
	"fmt"
	"sort"
	"time"

	"gofr.dev/pkg/gofr"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

	"github.com/opengittr/kubeui/internal/service"
)

type EventHandler struct {
	k8s *service.K8sManager
}

func NewEventHandler(k8s *service.K8sManager) *EventHandler {
	return &EventHandler{k8s: k8s}
}

type EventInfo struct {
	Name           string `json:"name"`
	Namespace      string `json:"namespace"`
	Type           string `json:"type"`
	Reason         string `json:"reason"`
	Message        string `json:"message"`
	Object         string `json:"object"`
	Count          int32  `json:"count"`
	FirstTimestamp string `json:"firstTimestamp"`
	LastTimestamp  string `json:"lastTimestamp"`
	Age            string `json:"age"`
}

func (h *EventHandler) List(ctx *gofr.Context) (interface{}, error) {
	namespace := ctx.Param("namespace")

	client, err := h.k8s.GetClient()
	if err != nil {
		return nil, err
	}

	events, err := client.CoreV1().Events(namespace).List(context.Background(), metav1.ListOptions{})
	if err != nil {
		return nil, err
	}

	var result []EventInfo
	for _, event := range events.Items {
		object := fmt.Sprintf("%s/%s", event.InvolvedObject.Kind, event.InvolvedObject.Name)

		firstTimestamp := ""
		if !event.FirstTimestamp.IsZero() {
			firstTimestamp = formatAge(event.FirstTimestamp.Time)
		}

		lastTimestamp := ""
		age := ""
		if !event.LastTimestamp.IsZero() {
			lastTimestamp = formatAge(event.LastTimestamp.Time)
			age = lastTimestamp
		} else if !event.EventTime.IsZero() {
			age = formatAge(event.EventTime.Time)
		}

		result = append(result, EventInfo{
			Name:           event.Name,
			Namespace:      event.Namespace,
			Type:           event.Type,
			Reason:         event.Reason,
			Message:        event.Message,
			Object:         object,
			Count:          event.Count,
			FirstTimestamp: firstTimestamp,
			LastTimestamp:  lastTimestamp,
			Age:            age,
		})
	}

	return result, nil
}

// WarningEventGroup represents a group of similar warning events
type WarningEventGroup struct {
	Reason     string `json:"reason"`
	Object     string `json:"object"`
	ObjectKind string `json:"objectKind"`
	ObjectName string `json:"objectName"`
	Message    string `json:"message"`
	Count      int32  `json:"count"`
	Namespace  string `json:"namespace"`
	LastSeen   string `json:"lastSeen"`
}

// ListWarnings returns warning events from the last 24h, grouped and deduplicated
func (h *EventHandler) ListWarnings(ctx *gofr.Context) (interface{}, error) {
	namespace := ctx.Param("namespace")

	client, err := h.k8s.GetClient()
	if err != nil {
		return nil, err
	}

	events, err := client.CoreV1().Events(namespace).List(context.Background(), metav1.ListOptions{})
	if err != nil {
		return nil, err
	}

	// Filter for warnings in the last 24 hours and group by reason+object+message
	cutoff := time.Now().Add(-24 * time.Hour)
	groups := make(map[string]*WarningEventGroup)

	for _, event := range events.Items {
		// Only include Warning events
		if event.Type != "Warning" {
			continue
		}

		// Check if event is within last 24 hours
		eventTime := event.LastTimestamp.Time
		if eventTime.IsZero() {
			eventTime = event.EventTime.Time
		}
		if eventTime.IsZero() {
			eventTime = event.FirstTimestamp.Time
		}
		if eventTime.Before(cutoff) {
			continue
		}

		object := fmt.Sprintf("%s/%s", event.InvolvedObject.Kind, event.InvolvedObject.Name)
		// Include namespace in key to avoid grouping same-named resources from different namespaces
		key := fmt.Sprintf("%s|%s|%s|%s", event.Namespace, event.Reason, object, event.Message)

		if existing, ok := groups[key]; ok {
			existing.Count += event.Count
			if existing.Count == 0 {
				existing.Count = 1
			}
			// Keep the most recent lastSeen
			if eventTime.After(cutoff) {
				existing.LastSeen = formatAge(eventTime)
			}
		} else {
			count := event.Count
			if count == 0 {
				count = 1
			}
			groups[key] = &WarningEventGroup{
				Reason:     event.Reason,
				Object:     object,
				ObjectKind: event.InvolvedObject.Kind,
				ObjectName: event.InvolvedObject.Name,
				Message:    event.Message,
				Count:      count,
				Namespace:  event.Namespace,
				LastSeen:   formatAge(eventTime),
			}
		}
	}

	// Convert map to slice and sort by count (most frequent first)
	result := make([]WarningEventGroup, 0, len(groups))
	for _, group := range groups {
		result = append(result, *group)
	}

	sort.Slice(result, func(i, j int) bool {
		return result[i].Count > result[j].Count
	})

	return result, nil
}
