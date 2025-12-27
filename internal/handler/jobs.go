package handler

import (
	"context"
	"fmt"
	"strings"

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
	Name              string                `json:"name"`
	Namespace         string                `json:"namespace"`
	Completions       string                `json:"completions"`
	Parallelism       int32                 `json:"parallelism,omitempty"`
	Duration          string                `json:"duration,omitempty"`
	Age               string                `json:"age"`
	Status            string                `json:"status"`
	StartTime         string                `json:"startTime,omitempty"`
	CompletionTime    string                `json:"completionTime,omitempty"`
	Succeeded         int32                 `json:"succeeded,omitempty"`
	Failed            int32                 `json:"failed,omitempty"`
	Active            int32                 `json:"active,omitempty"`
	Labels            map[string]string     `json:"labels,omitempty"`
	Selector          map[string]string     `json:"selector,omitempty"`
	ContainerDetails  []JobContainer        `json:"containerDetails,omitempty"`
	Conditions        []JobCondition        `json:"conditions,omitempty"`
	RunningContainers []JobRunningContainer `json:"runningContainers,omitempty"`
}

type JobContainer struct {
	Name   string        `json:"name"`
	Image  string        `json:"image"`
	CPU    ResourceUsage `json:"cpu"`
	Memory ResourceUsage `json:"memory"`
}

type JobCondition struct {
	Type    string `json:"type"`
	Status  string `json:"status"`
	Reason  string `json:"reason"`
	Message string `json:"message"`
}

type JobRunningContainer struct {
	PodName       string        `json:"podName"`
	ContainerName string        `json:"containerName"`
	Ready         bool          `json:"ready"`
	State         string        `json:"state"`
	Restarts      int32         `json:"restarts"`
	CPU           ResourceUsage `json:"cpu"`
	Memory        ResourceUsage `json:"memory"`
}

type CronJobInfo struct {
	Name                   string            `json:"name"`
	Namespace              string            `json:"namespace"`
	Schedule               string            `json:"schedule"`
	Suspend                bool              `json:"suspend"`
	Active                 int               `json:"active"`
	LastSchedule           string            `json:"lastSchedule,omitempty"`
	Age                    string            `json:"age"`
	ConcurrencyPolicy      string            `json:"concurrencyPolicy,omitempty"`
	SuccessfulJobsLimit    int32             `json:"successfulJobsLimit,omitempty"`
	FailedJobsLimit        int32             `json:"failedJobsLimit,omitempty"`
	Labels                 map[string]string `json:"labels,omitempty"`
	ContainerDetails       []JobContainer    `json:"containerDetails,omitempty"`
	ActiveJobs             []string          `json:"activeJobs,omitempty"`
	LastSuccessfulTime     string            `json:"lastSuccessfulTime,omitempty"`
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

// GetJob returns details of a specific job
func (h *JobHandler) GetJob(ctx *gofr.Context) (interface{}, error) {
	namespace := ctx.PathParam("namespace")
	name := ctx.PathParam("name")

	client, err := h.k8s.GetClient()
	if err != nil {
		return nil, err
	}

	j, err := client.BatchV1().Jobs(namespace).Get(context.Background(), name, metav1.GetOptions{})
	if err != nil {
		return nil, err
	}

	completions := int32(1)
	if j.Spec.Completions != nil {
		completions = *j.Spec.Completions
	}

	parallelism := int32(1)
	if j.Spec.Parallelism != nil {
		parallelism = *j.Spec.Parallelism
	}

	status := "Running"
	if j.Status.Succeeded > 0 && j.Status.Succeeded >= completions {
		status = "Complete"
	} else if j.Status.Failed > 0 {
		status = "Failed"
	}

	duration := ""
	if j.Status.CompletionTime != nil && j.Status.StartTime != nil {
		d := j.Status.CompletionTime.Sub(j.Status.StartTime.Time)
		duration = d.String()
	}

	info := JobInfo{
		Name:        j.Name,
		Namespace:   j.Namespace,
		Completions: fmt.Sprintf("%d/%d", j.Status.Succeeded, completions),
		Parallelism: parallelism,
		Duration:    duration,
		Age:         formatAge(j.CreationTimestamp.Time),
		Status:      status,
		Succeeded:   j.Status.Succeeded,
		Failed:      j.Status.Failed,
		Active:      j.Status.Active,
		Labels:      j.Labels,
	}

	if j.Status.StartTime != nil {
		info.StartTime = j.Status.StartTime.Format("2006-01-02 15:04:05")
	}
	if j.Status.CompletionTime != nil {
		info.CompletionTime = j.Status.CompletionTime.Format("2006-01-02 15:04:05")
	}

	if j.Spec.Selector != nil {
		info.Selector = j.Spec.Selector.MatchLabels
	}

	// Container details from spec
	for _, c := range j.Spec.Template.Spec.Containers {
		container := JobContainer{
			Name:  c.Name,
			Image: c.Image,
		}
		if c.Resources.Requests != nil {
			container.CPU.Request = c.Resources.Requests.Cpu().MilliValue()
			container.Memory.Request = c.Resources.Requests.Memory().Value()
		}
		if c.Resources.Limits != nil {
			container.CPU.Limit = c.Resources.Limits.Cpu().MilliValue()
			container.Memory.Limit = c.Resources.Limits.Memory().Value()
		}
		info.ContainerDetails = append(info.ContainerDetails, container)
	}

	// Conditions
	for _, cond := range j.Status.Conditions {
		info.Conditions = append(info.Conditions, JobCondition{
			Type:    string(cond.Type),
			Status:  string(cond.Status),
			Reason:  cond.Reason,
			Message: cond.Message,
		})
	}

	// Fetch running containers (pods created by this job)
	info.RunningContainers = h.fetchJobRunningContainers(namespace, j.Name)

	return info, nil
}

// fetchJobRunningContainers gets all running container instances from pods created by the job
func (h *JobHandler) fetchJobRunningContainers(namespace, jobName string) []JobRunningContainer {
	labelSelector := fmt.Sprintf("job-name=%s", jobName)

	client, err := h.k8s.GetClient()
	if err != nil {
		return nil
	}

	pods, err := client.CoreV1().Pods(namespace).List(context.Background(), metav1.ListOptions{
		LabelSelector: labelSelector,
	})
	if err != nil {
		return nil
	}

	// Get metrics if available
	metricsMap := make(map[string]map[string]ContainerResource)
	mc, err := h.k8s.GetMetricsClient()
	if err == nil {
		podMetrics, err := mc.MetricsV1beta1().PodMetricses(namespace).List(context.Background(), metav1.ListOptions{
			LabelSelector: labelSelector,
		})
		if err == nil {
			for _, pm := range podMetrics.Items {
				if metricsMap[pm.Name] == nil {
					metricsMap[pm.Name] = make(map[string]ContainerResource)
				}
				for _, cm := range pm.Containers {
					metricsMap[pm.Name][cm.Name] = ContainerResource{
						CPU:    ResourceUsage{Usage: cm.Usage.Cpu().MilliValue()},
						Memory: ResourceUsage{Usage: cm.Usage.Memory().Value()},
					}
				}
			}
		}
	}

	var result []JobRunningContainer
	for _, pod := range pods.Items {
		for _, cs := range pod.Status.ContainerStatuses {
			state := "unknown"
			if cs.State.Running != nil {
				state = "running"
			} else if cs.State.Waiting != nil {
				state = cs.State.Waiting.Reason
			} else if cs.State.Terminated != nil {
				state = cs.State.Terminated.Reason
			}

			rc := JobRunningContainer{
				PodName:       pod.Name,
				ContainerName: cs.Name,
				Ready:         cs.Ready,
				State:         state,
				Restarts:      cs.RestartCount,
			}

			// Add metrics if available
			if podMetrics, ok := metricsMap[pod.Name]; ok {
				if cm, ok := podMetrics[cs.Name]; ok {
					rc.CPU.Usage = cm.CPU.Usage
					rc.Memory.Usage = cm.Memory.Usage
				}
			}

			// Get request/limit from pod spec
			for _, c := range pod.Spec.Containers {
				if c.Name == cs.Name {
					if c.Resources.Requests != nil {
						rc.CPU.Request = c.Resources.Requests.Cpu().MilliValue()
						rc.Memory.Request = c.Resources.Requests.Memory().Value()
					}
					if c.Resources.Limits != nil {
						rc.CPU.Limit = c.Resources.Limits.Cpu().MilliValue()
						rc.Memory.Limit = c.Resources.Limits.Memory().Value()
					}
					break
				}
			}

			result = append(result, rc)
		}
	}

	return result
}

// JobEvents returns events for a specific job
func (h *JobHandler) JobEvents(ctx *gofr.Context) (interface{}, error) {
	namespace := ctx.PathParam("namespace")
	name := ctx.PathParam("name")

	client, err := h.k8s.GetClient()
	if err != nil {
		return nil, err
	}

	fieldSelector := fmt.Sprintf("involvedObject.name=%s,involvedObject.namespace=%s,involvedObject.kind=Job", name, namespace)
	events, err := client.CoreV1().Events(namespace).List(context.Background(), metav1.ListOptions{
		FieldSelector: fieldSelector,
	})
	if err != nil {
		return nil, err
	}

	type JobEvent struct {
		Type    string `json:"type"`
		Reason  string `json:"reason"`
		Message string `json:"message"`
		Count   int32  `json:"count"`
		Age     string `json:"age"`
	}

	var result []JobEvent
	for _, event := range events.Items {
		age := ""
		if !event.LastTimestamp.IsZero() {
			age = formatAge(event.LastTimestamp.Time)
		} else if !event.EventTime.IsZero() {
			age = formatAge(event.EventTime.Time)
		}

		result = append(result, JobEvent{
			Type:    event.Type,
			Reason:  event.Reason,
			Message: event.Message,
			Count:   event.Count,
			Age:     age,
		})
	}

	return result, nil
}

// GetCronJob returns details of a specific cronjob
func (h *JobHandler) GetCronJob(ctx *gofr.Context) (interface{}, error) {
	namespace := ctx.PathParam("namespace")
	name := ctx.PathParam("name")

	client, err := h.k8s.GetClient()
	if err != nil {
		return nil, err
	}

	cj, err := client.BatchV1().CronJobs(namespace).Get(context.Background(), name, metav1.GetOptions{})
	if err != nil {
		return nil, err
	}

	lastSchedule := ""
	if cj.Status.LastScheduleTime != nil {
		lastSchedule = formatAge(cj.Status.LastScheduleTime.Time)
	}

	lastSuccessful := ""
	if cj.Status.LastSuccessfulTime != nil {
		lastSuccessful = formatAge(cj.Status.LastSuccessfulTime.Time)
	}

	successfulLimit := int32(3)
	if cj.Spec.SuccessfulJobsHistoryLimit != nil {
		successfulLimit = *cj.Spec.SuccessfulJobsHistoryLimit
	}

	failedLimit := int32(1)
	if cj.Spec.FailedJobsHistoryLimit != nil {
		failedLimit = *cj.Spec.FailedJobsHistoryLimit
	}

	info := CronJobInfo{
		Name:                cj.Name,
		Namespace:           cj.Namespace,
		Schedule:            cj.Spec.Schedule,
		Suspend:             *cj.Spec.Suspend,
		Active:              len(cj.Status.Active),
		LastSchedule:        lastSchedule,
		Age:                 formatAge(cj.CreationTimestamp.Time),
		ConcurrencyPolicy:   string(cj.Spec.ConcurrencyPolicy),
		SuccessfulJobsLimit: successfulLimit,
		FailedJobsLimit:     failedLimit,
		Labels:              cj.Labels,
		LastSuccessfulTime:  lastSuccessful,
	}

	// Active jobs
	for _, ref := range cj.Status.Active {
		info.ActiveJobs = append(info.ActiveJobs, ref.Name)
	}

	// Container details from job template spec
	for _, c := range cj.Spec.JobTemplate.Spec.Template.Spec.Containers {
		container := JobContainer{
			Name:  c.Name,
			Image: c.Image,
		}
		if c.Resources.Requests != nil {
			container.CPU.Request = c.Resources.Requests.Cpu().MilliValue()
			container.Memory.Request = c.Resources.Requests.Memory().Value()
		}
		if c.Resources.Limits != nil {
			container.CPU.Limit = c.Resources.Limits.Cpu().MilliValue()
			container.Memory.Limit = c.Resources.Limits.Memory().Value()
		}
		info.ContainerDetails = append(info.ContainerDetails, container)
	}

	return info, nil
}

// CronJobEvents returns events for a specific cronjob
func (h *JobHandler) CronJobEvents(ctx *gofr.Context) (interface{}, error) {
	namespace := ctx.PathParam("namespace")
	name := ctx.PathParam("name")

	client, err := h.k8s.GetClient()
	if err != nil {
		return nil, err
	}

	fieldSelector := fmt.Sprintf("involvedObject.name=%s,involvedObject.namespace=%s,involvedObject.kind=CronJob", name, namespace)
	events, err := client.CoreV1().Events(namespace).List(context.Background(), metav1.ListOptions{
		FieldSelector: fieldSelector,
	})
	if err != nil {
		return nil, err
	}

	type CronJobEvent struct {
		Type    string `json:"type"`
		Reason  string `json:"reason"`
		Message string `json:"message"`
		Count   int32  `json:"count"`
		Age     string `json:"age"`
	}

	var result []CronJobEvent
	for _, event := range events.Items {
		age := ""
		if !event.LastTimestamp.IsZero() {
			age = formatAge(event.LastTimestamp.Time)
		} else if !event.EventTime.IsZero() {
			age = formatAge(event.EventTime.Time)
		}

		result = append(result, CronJobEvent{
			Type:    event.Type,
			Reason:  event.Reason,
			Message: event.Message,
			Count:   event.Count,
			Age:     age,
		})
	}

	return result, nil
}

// CronJobJobs returns jobs created by a specific cronjob
func (h *JobHandler) CronJobJobs(ctx *gofr.Context) (interface{}, error) {
	namespace := ctx.PathParam("namespace")
	name := ctx.PathParam("name")

	client, err := h.k8s.GetClient()
	if err != nil {
		return nil, err
	}

	// Get jobs owned by this cronjob
	jobs, err := client.BatchV1().Jobs(namespace).List(context.Background(), metav1.ListOptions{})
	if err != nil {
		return nil, err
	}

	var result []JobInfo
	for _, j := range jobs.Items {
		// Check if this job was created by the cronjob
		isOwned := false
		for _, ref := range j.OwnerReferences {
			if ref.Kind == "CronJob" && ref.Name == name {
				isOwned = true
				break
			}
		}
		if !isOwned {
			// Also check by name prefix (cronjob-<timestamp>)
			if !strings.HasPrefix(j.Name, name+"-") {
				continue
			}
		}

		completions := int32(1)
		if j.Spec.Completions != nil {
			completions = *j.Spec.Completions
		}

		status := "Running"
		if j.Status.Succeeded > 0 && j.Status.Succeeded >= completions {
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
			Completions: fmt.Sprintf("%d/%d", j.Status.Succeeded, completions),
			Duration:    duration,
			Age:         formatAge(j.CreationTimestamp.Time),
			Status:      status,
		})
	}

	return result, nil
}
