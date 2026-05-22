package main

import (
	"bufio"
	"encoding/json"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

type EmbeddingRecord struct {
	ID        string    `json:"id"`
	Embedding []float64 `json:"embedding"`
}

type Edge struct {
	ID     string  `json:"id"`
	Weight float64 `json:"weight"`
}

type Graph map[string][]Edge

type Candidate struct {
	A      int
	B      int
	Weight float64
}

type Range struct {
	Start int
	End   int
}

const (
	defaultThreshold    = 0.55
	defaultMaxNeighbors = 7
	defaultChunkSize    = 250
)

func defaultConcurrency() int {
	cpu := runtime.NumCPU()
	if cpu < 1 {
		return 1
	}
	if cpu > 8 {
		return 8
	}
	return cpu
}

func getArgValue(name string) string {
	prefix := "--" + name + "="
	for _, arg := range os.Args[1:] {
		if strings.HasPrefix(arg, prefix) {
			return strings.TrimPrefix(arg, prefix)
		}
	}
	return ""
}

func toFloat(value string, fallback float64) float64 {
	if value == "" {
		return fallback
	}
	parsed, err := strconv.ParseFloat(value, 64)
	if err != nil {
		return fallback
	}
	return parsed
}

func toInt(value string, fallback int) int {
	if value == "" {
		return fallback
	}
	parsed, err := strconv.ParseInt(value, 10, 64)
	if err != nil {
		return fallback
	}
	return int(parsed)
}

func normalize(vector []float64) []float64 {
	var sumSquares float64
	for _, v := range vector {
		sumSquares += v * v
	}
	if sumSquares == 0 {
		out := make([]float64, len(vector))
		return out
	}
	norm := math.Sqrt(sumSquares)
	out := make([]float64, len(vector))
	for i, v := range vector {
		out[i] = v / norm
	}
	return out
}

// TODO: Replace with AVX2 implementation when ready.
func dot(a []float64, b []float64) float64 {
	var total float64
	for i := 0; i < len(a); i++ {
		total += a[i] * b[i]
	}
	return total
}

func loadEmbeddings(inputPath string) ([]string, [][]float64, error) {
	file, err := os.Open(inputPath)
	if err != nil {
		return nil, nil, err
	}
	defer file.Close()

	decoder := json.NewDecoder(bufio.NewReader(file))
	token, err := decoder.Token()
	if err != nil {
		return nil, nil, err
	}
	if delim, ok := token.(json.Delim); !ok || delim != '[' {
		return nil, nil, fmt.Errorf("expected JSON array in embeddings file")
	}

	ids := make([]string, 0, 1024)
	vectors := make([][]float64, 0, 1024)

	for decoder.More() {
		var record EmbeddingRecord
		if err := decoder.Decode(&record); err != nil {
			return nil, nil, err
		}
		if record.ID == "" || len(record.Embedding) == 0 {
			continue
		}

		ids = append(ids, record.ID)
		vectors = append(vectors, normalize(record.Embedding))
	}

	return ids, vectors, nil
}

func main() {
	threshold := toFloat(getArgValue("threshold"), defaultThreshold)
	maxNeighbors := toInt(getArgValue("maxNeighbors"), defaultMaxNeighbors)
	concurrency := toInt(getArgValue("concurrency"), defaultConcurrency())
	chunkSize := toInt(getArgValue("chunkSize"), defaultChunkSize)

	inputPath := getArgValue("input")
	if inputPath == "" {
		inputPath = filepath.Join("generated", "embeddings.json")
	}

	outputPath := getArgValue("output")
	if outputPath == "" {
		outputPath = filepath.Join("generated", "graph.json")
	}

	if threshold < -1 || threshold > 1 {
		fmt.Fprintln(os.Stderr, "Threshold must be between -1 and 1.")
		os.Exit(1)
	}

	ids, vectors, err := loadEmbeddings(inputPath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error loading embeddings: %v\n", err)
		os.Exit(1)
	}

	total := len(ids)
	if total == 0 {
		fmt.Fprintln(os.Stderr, "No embeddings found in input file.")
		os.Exit(1)
	}

	graph := make(Graph, total)
	for _, id := range ids {
		graph[id] = []Edge{}
	}

	ranges := make([]Range, 0, (total+chunkSize-1)/chunkSize)
	for start := 0; start < total; start += chunkSize {
		end := start + chunkSize
		if end > total {
			end = total
		}
		ranges = append(ranges, Range{Start: start, End: end})
	}

	jobs := make(chan Range)
	results := make(chan []Candidate)
	var comparisons uint64
	totalComparisons := uint64(total*(total-1)) / 2

	var wg sync.WaitGroup
	for i := 0; i < concurrency; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for r := range jobs {
				local := make([]Candidate, 0)
				for i := r.Start; i < r.End; i++ {
					for j := i + 1; j < total; j++ {
						similarity := dot(vectors[i], vectors[j])
						if similarity >= threshold {
							local = append(local, Candidate{A: i, B: j, Weight: similarity})
						}
					}
					atomic.AddUint64(&comparisons, uint64(total-i-1))
				}
				results <- local
			}
		}()
	}

	go func() {
		wg.Wait()
		close(results)
	}()

	go func() {
		for _, r := range ranges {
			jobs <- r
		}
		close(jobs)
	}()

	done := make(chan struct{})
	go func() {
		ticker := time.NewTicker(3 * time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-done:
				return
			case <-ticker.C:
				current := atomic.LoadUint64(&comparisons)
				percent := float64(current) / float64(totalComparisons) * 100
				fmt.Printf("Progress: %.2f%% (%d/%d)\n", percent, current, totalComparisons)
			}
		}
	}()

	candidates := make([]Candidate, 0)
	for chunk := range results {
		candidates = append(candidates, chunk...)
		current := atomic.LoadUint64(&comparisons)
		percent := float64(current) / float64(totalComparisons) * 100
		fmt.Printf("Progress: %.2f%% (%d/%d)\n", percent, current, totalComparisons)
	}
	close(done)

	sort.Slice(candidates, func(i, j int) bool {
		return candidates[i].Weight > candidates[j].Weight
	})

	degree := make([]int, total)
	selected := make([]Candidate, 0)

	for _, edge := range candidates {
		da := degree[edge.A]
		db := degree[edge.B]
		if da >= maxNeighbors || db >= maxNeighbors {
			continue
		}
		if da == 0 || db == 0 {
			selected = append(selected, edge)
			degree[edge.A] = da + 1
			degree[edge.B] = db + 1
		}
	}

	for _, edge := range candidates {
		da := degree[edge.A]
		db := degree[edge.B]
		if da >= maxNeighbors || db >= maxNeighbors {
			continue
		}
		selected = append(selected, edge)
		degree[edge.A] = da + 1
		degree[edge.B] = db + 1
	}

	orphans := make([]int, 0)
	for i := 0; i < total; i++ {
		if degree[i] == 0 {
			orphans = append(orphans, i)
		}
	}

	orphanEdges := make([]Candidate, 0, len(orphans))
	if total > 1 && len(orphans) > 0 {
		orphanJobs := make(chan int)
		orphanResults := make(chan Candidate)
		var orphanDone uint64

		var orphanWg sync.WaitGroup
		for i := 0; i < concurrency; i++ {
			orphanWg.Add(1)
			go func() {
				defer orphanWg.Done()
				for idx := range orphanJobs {
					bestIdx := -1
					bestWeight := -2.0
					for j := 0; j < total; j++ {
						if idx == j {
							continue
						}
						similarity := dot(vectors[idx], vectors[j])
						if similarity > bestWeight {
							bestWeight = similarity
							bestIdx = j
						}
					}
					if bestIdx >= 0 {
						// Ensure orphans get at least one edge, even if the neighbor is at capacity.
						orphanResults <- Candidate{A: idx, B: bestIdx, Weight: bestWeight}
					}
					atomic.AddUint64(&orphanDone, 1)
				}
			}()
		}

		go func() {
			orphanWg.Wait()
			close(orphanResults)
		}()

		go func() {
			for _, idx := range orphans {
				orphanJobs <- idx
			}
			close(orphanJobs)
		}()

		orphanProgressDone := make(chan struct{})
		go func() {
			ticker := time.NewTicker(3 * time.Second)
			defer ticker.Stop()
			for {
				select {
				case <-orphanProgressDone:
					return
				case <-ticker.C:
					current := atomic.LoadUint64(&orphanDone)
					percent := float64(current) / float64(len(orphans)) * 100
					fmt.Printf("Orphan pass: %.2f%% (%d/%d)\n", percent, current, len(orphans))
				}
			}
		}()

		for edge := range orphanResults {
			orphanEdges = append(orphanEdges, edge)
		}
		close(orphanProgressDone)
	}

	selected = append(selected, orphanEdges...)

	for _, edge := range selected {
		a := ids[edge.A]
		b := ids[edge.B]
		graph[a] = append(graph[a], Edge{ID: b, Weight: edge.Weight})
		graph[b] = append(graph[b], Edge{ID: a, Weight: edge.Weight})
	}

	isolated := 0
	maxDegreeObserved := 0
	for _, id := range ids {
		d := len(graph[id])
		if d == 0 {
			isolated += 1
		}
		if d > maxDegreeObserved {
			maxDegreeObserved = d
		}
	}

	fmt.Printf("Prune summary: candidates=%d, selected=%d, maxNeighbors=%d, isolated=%d, maxDegree=%d\n",
		len(candidates), len(selected), maxNeighbors, isolated, maxDegreeObserved)

	outputFile, err := os.Create(outputPath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error creating output file: %v\n", err)
		os.Exit(1)
	}
	defer outputFile.Close()

	encoder := json.NewEncoder(outputFile)
	encoder.SetIndent("", "  ")
	if err := encoder.Encode(graph); err != nil {
		fmt.Fprintf(os.Stderr, "Error writing graph: %v\n", err)
		os.Exit(1)
	}

	fmt.Printf("Graph saved to %s with threshold %.3f and maxNeighbors %d\n", outputPath, threshold, maxNeighbors)
}
