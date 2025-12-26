package handler

import (
	"context"
	"fmt"

	"gofr.dev/pkg/gofr"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

	"github.com/opengittr/kubeui/internal/service"
)

type JobHandler struct {
	k8s *service.K8sManager
}

func NewJobHandler(k8s *service.K8sManager) *JobHandler {
	return &JobHandler{k8s: k8s}
}

type JobInfo struct {
	Name        string `json:"name"`
	Namespace   string `json:"namespace"`
	Completions string `json:"completions"`
	Duration    string `json:"duration,omitempty"`
	Age         string `json:"age"`
	Status      string `json:"status"`
}

type CronJobInfo struct {
	Name         string `json:"name"`
	Namespace    string `json:"namespace"`
	Schedule     string `json:"schedule"`
	Suspend      bool   `json:"suspend"`
	Active       int    `json:"active"`
	LastSchedule string `json:"lastSchedule,omitempty"`
	Age          string `json:"age"`
}

func (h *JobHandler) ListJobs(ctx *gofr.Context) (interface{}, error) {
	namespace := ctx.Param("namespace")

	client, err := h.k8s.GetClient()
	if err != nil {
		return nil, err
	}

	jobs, err := client.BatchV1().Jobs(namespace).List(context.Background(), metav1.ListOptions{})
	if err != nil {
		return nil, err
	}

	var result []JobInfo
	for _, j := range jobs.Items {
		completions := fmt.Sprintf("%d/%d", j.Status.Succeeded, *j.Spec.Completions)

		status := "Running"
		if j.Status.Succeeded > 0 && j.Status.Succeeded == *j.Spec.Completions {
			status = "Complete"
		} else if j.Status.Failed > 0 {
			status = "Failed"
		}

		duration := ""
		if j.Status.CompletionTime != nil && j.Status.StartTime != nil {
			d := j.Status.CompletionTime.Sub(j.Status.StartTime.Time)
			duration = d.String()
		}

		result = append(result, JobInfo{
			Name:        j.Name,
			Namespace:   j.Namespace,
			Completions: completions,
			Duration:    duration,
			Age:         formatAge(j.CreationTimestamp.Time),
			Status:      status,
		})
	}

	return result, nil
}

func (h *JobHandler) ListCronJobs(ctx *gofr.Context) (interface{}, error) {
	namespace := ctx.Param("namespace")

	client, err := h.k8s.GetClient()
	if err != nil {
		return nil, err
	}

	cronJobs, err := client.BatchV1().CronJobs(namespace).List(context.Background(), metav1.ListOptions{})
	if err != nil {
		return nil, err
	}

	var result []CronJobInfo
	for _, cj := range cronJobs.Items {
		lastSchedule := ""
		if cj.Status.LastScheduleTime != nil {
			lastSchedule = formatAge(cj.Status.LastScheduleTime.Time)
		}

		result = append(result, CronJobInfo{
			Name:         cj.Name,
			Namespace:    cj.Namespace,
			Schedule:     cj.Spec.Schedule,
			Suspend:      *cj.Spec.Suspend,
			Active:       len(cj.Status.Active),
			LastSchedule: lastSchedule,
			Age:          formatAge(cj.CreationTimestamp.Time),
		})
	}

	return result, nil
}

func (h *JobHandler) DeleteJob(ctx *gofr.Context) (interface{}, error) {
	namespace := ctx.PathParam("namespace")
	name := ctx.PathParam("name")

	client, err := h.k8s.GetClient()
	if err != nil {
		return nil, err
	}

	// Use propagation policy to also delete pods created by the job
	propagationPolicy := metav1.DeletePropagationBackground
	err = client.BatchV1().Jobs(namespace).Delete(context.Background(), name, metav1.DeleteOptions{
		PropagationPolicy: &propagationPolicy,
	})
	if err != nil {
		return nil, err
	}

	return map[string]string{"message": fmt.Sprintf("Job %s deleted", name)}, nil
}

func (h *JobHandler) DeleteCronJob(ctx *gofr.Context) (interface{}, error) {
	namespace := ctx.PathParam("namespace")
	name := ctx.PathParam("name")

	client, err := h.k8s.GetClient()
	if err != nil {
		return nil, err
	}

	err = client.BatchV1().CronJobs(namespace).Delete(context.Background(), name, metav1.DeleteOptions{})
	if err != nil {
		return nil, err
	}

	return map[string]string{"message": fmt.Sprintf("CronJob %s deleted", name)}, nil
}
