---
layout: post
category: Course
classes: wide
author_profile: true
title: "Production-Grade Multi-Tenant LLM Serving Platform"
toc: true
canonical_url: "https://srimouli04.github.io/llm-gateway"
excerpt: "Designing an LLM Gateway"
toc_sticky: true
image: images/blog_posts/llm-gateway.jpg
display_html_image: false
tags: featured
---

# Production-Grade Multi-Tenant LLM Gateway

## 1. Problem Statement & Requirements

### 1.1 Business Context
You're managing enterprise LLM infrastructure serving 15+ engineering teams at scale. Current pain points:

**Critical Issues:**
- 💸 **Budget Overruns**: No cost visibility → teams can't be billed accurately
- ⚡ **Resource Contention**: Token free-for-all → critical apps get throttled
- 🎯 **Model Sprawl**: GPT-4o used for everything (even log parsing)
- 📊 **Zero Accountability**: Teams overconsume without consequences
- 🔒 **Security Gaps**: No PII protection, audit trails, or compliance controls

### 1.2 Functional Requirements

**FR1: Multi-Tenant Isolation**
- Support 15+ teams with independent quotas and budgets
- Prevent noisy neighbor problems
- Ensure fair resource allocation

**FR2: Cost Management**
- Token-level cost attribution per team/project/feature
- Real-time budget tracking and alerts
- Monthly/quarterly chargeback reports

**FR3: Rate Limiting**
- Multi-dimensional limits (tokens/min, requests/sec, concurrent requests)
- Per-team, per-model, per-priority quotas
- Graceful degradation under load

**FR4: Model Governance**
- Tiered model access (shared/premium/experimental)
- Automatic model selection based on use case
- Version management and rollback capabilities

**FR5: Observability**
- Real-time usage dashboards per team
- Cost anomaly detection
- Performance metrics (latency, throughput, cache hit ratio)

### 1.3 Non-Functional Requirements

**NFR1: Performance**
- P95 latency < 200ms for gateway overhead
- Support 10K+ requests/second
- 99.9% availability SLA

**NFR2: Scalability**
- Horizontal scaling for gateway and inference servers
- Support 100+ teams without architectural changes
- Handle 10x traffic spikes

**NFR3: Security**
- PII detection and redaction
- Audit logging for compliance (SOC2, HIPAA)
- API key rotation and management

**NFR4: Cost Efficiency**
- Response caching (70%+ hit rate target)
- Automatic model downgrading for simple queries
- Batch processing for non-real-time workloads

---

## 2. System Architecture

### 2.1 High-Level Architecture

```text
┌─────────────────────────────────────────────────────────────────┐
│                        Client Applications                       │
│  (15+ Engineering Teams: Web Apps, APIs, Batch Jobs, etc.)     │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                      API Gateway Layer                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │ Load Balancer│  │ Rate Limiter │  │ Auth Service │          │
│  │   (Envoy)    │  │   (Redis)    │  │   (OAuth2)   │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                    LLM Gateway Service                          │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  Request Processing Pipeline                               │ │
│  │  1. Authentication & Authorization                         │ │
│  │  2. Rate Limiting & Quota Check                            │ │
│  │  3. PII Detection & Redaction                              │ │
│  │  4. Cache Lookup (Semantic + Exact)                        │ │
│  │  5. Model Selection & Routing                              │ │
│  │  6. Cost Attribution & Logging                             │ │
│  └────────────────────────────────────────────────────────────┘ │
└────────────────────────┬────────────────────────────────────────┘
                         │
         ┌───────────────┼───────────────┐
         ▼               ▼               ▼
┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│   Shared    │  │   Premium   │  │Experimental │
│   Models    │  │   Models    │  │   Models    │
│             │  │             │  │             │
│ GPT-3.5     │  │ GPT-4o      │  │ o3-mini     │
│ Claude      │  │ Claude Opus │  │ Custom      │
│ Haiku       │  │ Gemini Pro  │  │ Fine-tuned  │
└─────────────┘  └─────────────┘  └─────────────┘
         │               │               │
         └───────────────┼───────────────┘
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Data & Analytics Layer                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐           │
│  │   Metrics    │  │    Logs      │  │   Billing    │           │
│  │ (Prometheus) │  │(Elasticsearch)│  │ (PostgreSQL) │          │
│  └──────────────┘  └──────────────┘  └──────────────┘           │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 Component Interaction Flow

```text
Client Request Flow:
1. Client → Load Balancer (Envoy) → API Gateway
2. API Gateway → Auth Service (validate API key/JWT)
3. API Gateway → Rate Limiter (check quotas)
4. API Gateway → LLM Gateway Service
5. LLM Gateway → Cache Layer (check for cached response)
6. LLM Gateway → Model Router (select appropriate model)
7. Model Router → Inference Service (execute request)
8. Response → Client (with cost metadata)
9. Async: Log metrics, update billing, store in cache
```

---

## 3. Core Components Deep Dive

### 3.1 LLM Gateway Service

**Technology Stack:**
- **Language**: Go (for high performance, low latency)
- **Framework**: gRPC for internal services, REST for external APIs
- **Concurrency**: Goroutines for parallel processing

**Key Responsibilities:**

```go
type LLMGateway struct {
    authService      *AuthService
    rateLimiter      *RateLimiter
    cacheManager     *CacheManager
    modelRouter      *ModelRouter
    costTracker      *CostTracker
    piiDetector      *PIIDetector
    metricsCollector *MetricsCollector
}

type InferenceRequest struct {
    RequestID    string
    TeamID       string
    ProjectID    string
    UserID       string
    Prompt       string
    ModelHint    string  // Optional: preferred model
    MaxTokens    int
    Temperature  float64
    Priority     Priority // HIGH, MEDIUM, LOW
    Metadata     map[string]string
    CachePolicy  CachePolicy
}

type InferenceResponse struct {
    RequestID       string
    Response        string
    ModelUsed       string
    TokensUsed      TokenUsage
    Latency         time.Duration
    CacheHit        bool
    Cost            Cost
    Metadata        map[string]string
}

type TokenUsage struct {
    PromptTokens     int
    CompletionTokens int
    TotalTokens      int
}

type Cost struct {
    Amount       float64
    Currency     string
    ModelCost    float64
    CacheSavings float64
}
```

**Request Processing Pipeline:**

```go
func (g *LLMGateway) ProcessRequest(ctx context.Context, req *InferenceRequest) (*InferenceResponse, error) {
    // 1. Authentication & Authorization
    team, err := g.authService.Authenticate(ctx, req)
    if err != nil {
        return nil, fmt.Errorf("auth failed: %w", err)
    }
    
    // 2. Rate Limiting & Quota Check
    allowed, err := g.rateLimiter.CheckAndConsume(ctx, team.ID, req)
    if err != nil {
        return nil, fmt.Errorf("rate limit check failed: %w", err)
    }
    if !allowed {
        return nil, ErrRateLimitExceeded
    }
    
    // 3. PII Detection & Redaction (async for performance)
    go g.piiDetector.ScanAndLog(ctx, req)
    
    // 4. Cache Lookup
    if cachedResp, found := g.cacheManager.Get(ctx, req); found {
        g.metricsCollector.RecordCacheHit(team.ID)
        return cachedResp, nil
    }
    
    // 5. Model Selection & Routing
    model, err := g.modelRouter.SelectModel(ctx, team, req)
    if err != nil {
        return nil, fmt.Errorf("model selection failed: %w", err)
    }
    
    // 6. Execute Inference
    startTime := time.Now()
    resp, err := model.Generate(ctx, req)
    if err != nil {
        return nil, fmt.Errorf("inference failed: %w", err)
    }
    latency := time.Since(startTime)
    
    // 7. Cost Attribution
    cost := g.costTracker.CalculateCost(model, resp.TokensUsed)
    g.costTracker.RecordUsage(ctx, team.ID, req.ProjectID, cost)
    
    // 8. Cache Response (async)
    go g.cacheManager.Set(ctx, req, resp)
    
    // 9. Metrics & Logging
    g.metricsCollector.RecordRequest(team.ID, model.Name, latency, cost)
    
    return &InferenceResponse{
        RequestID:       req.RequestID,
        Response:        resp.Text,
        ModelUsed:       model.Name,
        TokensUsed:      resp.TokensUsed,
        Latency:         latency,
        CacheHit:        false,
        Cost:            cost,
    }, nil
}
```

### 3.2 Authentication & Authorization Service

**Multi-Level Access Control:**

```go
type AuthService struct {
    apiKeyStore    *APIKeyStore
    jwtValidator   *JWTValidator
    rbacEngine     *RBACEngine
    auditLogger    *AuditLogger
}

type Team struct {
    ID              string
    Name            string
    Tier            TeamTier  // FREE, STANDARD, PREMIUM, ENTERPRISE
    Quotas          Quotas
    AllowedModels   []string
    CostCenter      string
    Admins          []string
}

type TeamTier int
const (
    TierFree TeamTier = iota
    TierStandard
    TierPremium
    TierEnterprise
)

type Quotas struct {
    TokensPerMinute      int
    RequestsPerSecond    int
    ConcurrentRequests   int
    MonthlyTokenQuota    int64
    MonthlyBudget        float64
    DailyBudget          float64
}

func (a *AuthService) Authenticate(ctx context.Context, req *InferenceRequest) (*Team, error) {
    // Extract API key or JWT from request
    token := extractToken(req)
    
    // Validate token
    claims, err := a.jwtValidator.Validate(token)
    if err != nil {
        a.auditLogger.LogFailedAuth(req, err)
        return nil, ErrUnauthorized
    }
    
    // Load team configuration
    team, err := a.loadTeam(claims.TeamID)
    if err != nil {
        return nil, err
    }
    
    // Check RBAC permissions
    if !a.rbacEngine.HasPermission(claims.UserID, "llm:inference") {
        return nil, ErrForbidden
    }
    
    // Audit log
    a.auditLogger.LogAuth(req, team, claims.UserID)
    
    return team, nil
}
```

---

## 4. Rate Limiting & Quota Management

### 4.1 Multi-Dimensional Rate Limiting

**Implementation using Token Bucket + Sliding Window:**

```go
type RateLimiter struct {
    redis          *redis.Client
    quotaStore     *QuotaStore
    alertManager   *AlertManager
}

type RateLimitConfig struct {
    TeamID                string
    TokensPerMinute       int
    RequestsPerSecond     int
    ConcurrentRequests    int
    MonthlyTokenQuota     int64
    BurstAllowance        int  // Allow temporary bursts
}

// Multi-dimensional rate limiting check
func (r *RateLimiter) CheckAndConsume(ctx context.Context, teamID string, req *InferenceRequest) (bool, error) {
    config, err := r.quotaStore.GetConfig(teamID)
    if err != nil {
        return false, err
    }
    
    // 1. Check concurrent requests (using Redis counter)
    concurrent, err := r.checkConcurrentRequests(ctx, teamID, config.ConcurrentRequests)
    if err != nil || !concurrent {
        return false, ErrConcurrentLimitExceeded
    }
    
    // 2. Check requests per second (sliding window)
    rps, err := r.checkRequestsPerSecond(ctx, teamID, config.RequestsPerSecond)
    if err != nil || !rps {
        return false, ErrRPSLimitExceeded
    }
    
    // 3. Check tokens per minute (token bucket)
    estimatedTokens := estimateTokens(req.Prompt, req.MaxTokens)
    tpm, err := r.checkTokensPerMinute(ctx, teamID, estimatedTokens, config.TokensPerMinute)
    if err != nil || !tpm {
        return false, ErrTPMLimitExceeded
    }
    
    // 4. Check monthly quota
    monthlyOk, err := r.checkMonthlyQuota(ctx, teamID, estimatedTokens, config.MonthlyTokenQuota)
    if err != nil || !monthlyOk {
        r.alertManager.SendQuotaAlert(teamID, "monthly_quota_exceeded")
        return false, ErrMonthlyQuotaExceeded
    }
    
    return true, nil
}

// Token bucket implementation for TPM
func (r *RateLimiter) checkTokensPerMinute(ctx context.Context, teamID string, tokens, limit int) (bool, error) {
    key := fmt.Sprintf("tpm:%s", teamID)
    
    // Lua script for atomic token bucket operation
    script := `
        local key = KEYS[1]
        local limit = tonumber(ARGV[1])
        local tokens = tonumber(ARGV[2])
        local now = tonumber(ARGV[3])
        local window = 60  -- 60 seconds
        
        local current = redis.call('GET', key)
        if current == false then
            current = 0
        else
            current = tonumber(current)
        end
        
        -- Reset if window expired
        local ttl = redis.call('TTL', key)
        if ttl == -1 or ttl == -2 then
            redis.call('SET', key, tokens, 'EX', window)
            return 1
        end
        
        -- Check if adding tokens exceeds limit
        if current + tokens > limit then
            return 0
        end
        
        -- Consume tokens
        redis.call('INCRBY', key, tokens)
        return 1
    `
    
    result, err := r.redis.Eval(ctx, script, []string{key}, limit, tokens, time.Now().Unix()).Int()
    if err != nil {
        return false, err
    }
    
    return result == 1, nil
}

// Sliding window for RPS
func (r *RateLimiter) checkRequestsPerSecond(ctx context.Context, teamID string, limit int) (bool, error) {
    key := fmt.Sprintf("rps:%s", teamID)
    now := time.Now().Unix()
    windowStart := now - 1  // 1 second window
    
    pipe := r.redis.Pipeline()
    
    // Remove old entries
    pipe.ZRemRangeByScore(ctx, key, "0", fmt.Sprintf("%d", windowStart))
    
    // Count current requests in window
    pipe.ZCard(ctx, key)
    
    // Add current request
    pipe.ZAdd(ctx, key, redis.Z{Score: float64(now), Member: fmt.Sprintf("%d", now)})
    
    // Set expiry
    pipe.Expire(ctx, key, 2*time.Second)
    
    cmds, err := pipe.Exec(ctx)
    if err != nil {
        return false, err
    }
    
    count := cmds[1].(*redis.IntCmd).Val()
    return count < int64(limit), nil
}
```

### 4.2 Dynamic Quota Adjustment

```go
type QuotaManager struct {
    store          *QuotaStore
    usageAnalyzer  *UsageAnalyzer
    alertManager   *AlertManager
}

// Auto-scaling quotas based on usage patterns
func (q *QuotaManager) AdjustQuotas(ctx context.Context) error {
    teams, err := q.store.GetAllTeams()
    if err != nil {
        return err
    }
    
    for _, team := range teams {
        usage := q.usageAnalyzer.GetUsageStats(team.ID, 30*24*time.Hour)
        
        // Alert if approaching limits
        if usage.TokensUsed > float64(team.Quotas.MonthlyTokenQuota)*0.8 {
            q.alertManager.SendAlert(team.ID, AlertTypeQuotaWarning, map[string]interface{}{
                "usage_percent": (usage.TokensUsed / float64(team.Quotas.MonthlyTokenQuota)) * 100,
                "days_remaining": daysRemainingInMonth(),
            })
        }
        
        // Suggest quota increases for consistent high usage
        if usage.AverageUtilization > 0.9 {
            q.alertManager.SendAlert(team.ID, AlertTypeQuotaSuggestion, map[string]interface{}{
                "suggested_increase": calculateSuggestedIncrease(usage),
                "current_quota": team.Quotas.MonthlyTokenQuota,
            })
        }
    }
    
    return nil
}
```

---

## 5. Cost Attribution & Chargeback

### 5.1 Token-Level Cost Tracking

```go
type CostTracker struct {
    db             *sql.DB
    pricingEngine  *PricingEngine
    billingService *BillingService
}

type UsageRecord struct {
    ID              string
    Timestamp       time.Time
    TeamID          string
    ProjectID       string
    UserID          string
    RequestID       string
    ModelName       string
    PromptTokens    int
    CompletionTokens int
    TotalTokens     int
    Cost            float64
    CacheHit        bool
    Latency         time.Duration
    Metadata        map[string]string
}

type PricingEngine struct {
    modelPrices map[string]ModelPricing
}

type ModelPricing struct {
    ModelName           string
    PromptPricePer1K    float64  // USD per 1K tokens
    CompletionPricePer1K float64
    CachePricePer1K     float64  // Discounted price for cached prompts
}

var defaultPricing = map[string]ModelPricing{
    "gpt-4o": {
        ModelName:           "gpt-4o",
        PromptPricePer1K:    0.005,
        CompletionPricePer1K: 0.015,
        CachePricePer1K:     0.0025,
    },
    "gpt-3.5-turbo": {
        ModelName:           "gpt-3.5-turbo",
        PromptPricePer1K:    0.0005,
        CompletionPricePer1K: 0.0015,
        CachePricePer1K:     0.00025,
    },
    "claude-opus": {
        ModelName:           "claude-opus",
        PromptPricePer1K:    0.015,
        CompletionPricePer1K: 0.075,
        CachePricePer1K:     0.0075,
    },
}

func (c *CostTracker) CalculateCost(model string, tokens TokenUsage) Cost {
    pricing := c.pricingEngine.GetPricing(model)
    
    promptCost := (float64(tokens.PromptTokens) / 1000.0) * pricing.PromptPricePer1K
    completionCost := (float64(tokens.CompletionTokens) / 1000.0) * pricing.CompletionPricePer1K
    
    return Cost{
        Amount:    promptCost + completionCost,
        Currency:  "USD",
        ModelCost: promptCost + completionCost,
    }
}

func (c *CostTracker) RecordUsage(ctx context.Context, teamID, projectID string, cost Cost) error {
    record := &UsageRecord{
        ID:        generateID(),
        Timestamp: time.Now(),
        TeamID:    teamID,
        ProjectID: projectID,
        Cost:      cost.Amount,
    }
    
    // Store in database
    if err := c.db.InsertUsageRecord(ctx, record); err != nil {
        return err
    }
    
    // Update real-time billing
    return c.billingService.UpdateBalance(ctx, teamID, cost.Amount)
}
```

### 5.2 Chargeback Reports

```go
type ChargebackReport struct {
    TeamID          string
    Period          Period
    TotalCost       float64
    TotalTokens     int64
    RequestCount    int64
    BreakdownByModel map[string]ModelUsage
    BreakdownByProject map[string]ProjectUsage
    TopUsers        []UserUsage
    CacheSavings    float64
}

type ModelUsage struct {
    ModelName    string
    Requests     int64
    Tokens       int64
    Cost         float64
    AvgLatency   time.Duration
}

type ProjectUsage struct {
    ProjectID    string
    ProjectName  string
    Cost         float64
    Tokens       int64
    Requests     int64
}

func (c *CostTracker) GenerateChargebackReport(teamID string, period Period) (*ChargebackReport, error) {
    // Query usage data
    records, err := c.db.QueryUsageRecords(teamID, period.Start, period.End)
    if err != nil {
        return nil, err
    }
    
    report := &ChargebackReport{
        TeamID:             teamID,
        Period:             period,
        BreakdownByModel:   make(map[string]ModelUsage),
        BreakdownByProject: make(map[string]ProjectUsage),
    }
    
    // Aggregate data
    for _, record := range records {
        report.TotalCost += record.Cost
        report.TotalTokens += int64(record.TotalTokens)
        report.RequestCount++
        
        // By model
        modelUsage := report.BreakdownByModel[record.ModelName]
        modelUsage.ModelName = record.ModelName
        modelUsage.Requests++
        modelUsage.Tokens += int64(record.TotalTokens)
        modelUsage.Cost += record.Cost
        report.BreakdownByModel[record.ModelName] = modelUsage
        
        // By project
        projectUsage := report.BreakdownByProject[record.ProjectID]
        projectUsage.ProjectID = record.ProjectID
        projectUsage.Cost += record.Cost
        projectUsage.Tokens += int64(record.TotalTokens)
        projectUsage.Requests++
        report.BreakdownByProject[record.ProjectID] = projectUsage
        
        // Cache savings
        if record.CacheHit {
            report.CacheSavings += record.Cost * 0.5  // Assume 50% savings
        }
    }
    
    return report, nil
}
```

---

## 6. Model Access Control & Routing

### 6.1 Intelligent Model Selection

```go
type ModelRouter struct {
    modelRegistry  *ModelRegistry
    costOptimizer  *CostOptimizer
    performanceDB  *PerformanceDB
}

type Model struct {
    Name            string
    Provider        string  // OpenAI, Anthropic, Google, etc.
    Tier            ModelTier
    MaxTokens       int
    ContextWindow   int
    Capabilities    []string  // ["code", "reasoning", "creative", "analysis"]
    CostPerToken    float64
    AvgLatency      time.Duration
    Availability    float64  // 0.0 to 1.0
}

type ModelTier int
const (
    TierShared ModelTier = iota
    TierPremium
    TierExperimental
)

func (m *ModelRouter) SelectModel(ctx context.Context, team *Team, req *InferenceRequest) (*Model, error) {
    // 1. Check if team has access to requested model
    if req.ModelHint != "" {
        if !team.HasAccessToModel(req.ModelHint) {
            return nil, ErrModelAccessDenied
        }
        return m.modelRegistry.GetModel(req.ModelHint)
    }
    
    // 2. Automatic model selection based on request characteristics
    candidates := m.getCandidateModels(team)
    
    // 3. Score models based on multiple factors
    scores := make(map[string]float64)
    for _, model := range candidates {
        score := m.scoreModel(model, req, team)
        scores[model.Name] = score
    }
    
    // 4. Select best model
    bestModel := m.selectBestModel(candidates, scores)
    
    return bestModel, nil
}

func (m *ModelRouter) scoreModel(model *Model, req *InferenceRequest, team *Team) float64 {
    var score float64
    
    // Factor 1: Cost efficiency (40% weight)
    costScore := 1.0 - (model.CostPerToken / maxCostPerToken)
    score += costScore * 0.4
    
    // Factor 2: Performance (30% weight)
    latencyScore := 1.0 - (float64(model.AvgLatency) / float64(maxLatency))
    score += latencyScore * 0.3
    
    // Factor 3: Capability match (20% weight)
    capabilityScore := m.matchCapabilities(model, req)
    score += capabilityScore * 0.2
    
    // Factor 4: Availability (10% weight)
    score += model.Availability * 0.1
    
    // Adjust for priority
    if req.Priority == PriorityHigh {
        // Prefer faster models for high priority
        score += latencyScore * 0.2
    } else if req.Priority == PriorityLow {
        // Prefer cheaper models for low priority
        score += costScore * 0.2
    }
    
    return score
}

// Automatic model downgrading for simple queries
func (m *ModelRouter) shouldDowngradeModel(req *InferenceRequest) bool {
    // Heuristics for simple queries
    promptLength := len(req.Prompt)
    
    // Short prompts might not need premium models
    if promptLength < 100 && req.MaxTokens < 200 {
        return true
    }
    
    // Check for simple patterns (e.g., classification, extraction)
    simplePatterns := []string{
        "classify",
        "extract",
        "summarize in one sentence",
        "yes or no",
        "true or false",
    }
    
    promptLower := strings.ToLower(req.Prompt)
    for _, pattern := range simplePatterns {
        if strings.Contains(promptLower, pattern) {
            return true
        }
    }
    
    return false
}
```

### 6.2 Model Fallback & Circuit Breaker

```go
type CircuitBreaker struct {
    state          CircuitState
    failureCount   int
    successCount   int
    lastFailTime   time.Time
    threshold      int
    timeout        time.Duration
    mu             sync.RWMutex
}

type CircuitState int
const (
    StateClosed CircuitState = iota
    StateOpen
    StateHalfOpen
)

func (cb *CircuitBreaker) Call(fn func() error) error {
    cb.mu.Lock()
    defer cb.mu.Unlock()
    
    switch cb.state {
    case StateOpen:
        if time.Since(cb.lastFailTime) > cb.timeout {
            cb.state = StateHalfOpen
            cb.successCount = 0
        } else {
            return ErrCircuitOpen
        }
    }
    
    err := fn()
    
    if err != nil {
        cb.failureCount++
        cb.lastFailTime = time.Now()
        
        if cb.failureCount >= cb.threshold {
            cb.state = StateOpen
        }
        return err
    }
    
    cb.successCount++
    if cb.state == StateHalfOpen && cb.successCount >= 3 {
        cb.state = StateClosed
        cb.failureCount = 0
    }
    
    return nil
}

// Model fallback chain
func (m *ModelRouter) ExecuteWithFallback(ctx context.Context, req *InferenceRequest, models []*Model) (*InferenceResponse, error) {
    var lastErr error
    
    for i, model := range models {
        cb := m.getCircuitBreaker(model.Name)
        
        err := cb.Call(func() error {
            resp, err := model.Generate(ctx, req)
            if err == nil {
                return nil
            }
            return err
        })
        
        if err == nil {
            resp, err := model.Generate(ctx, req)
            if err == nil {
                return resp, nil
            }
        }
        
        lastErr = err
        
        // Log fallback
        log.Warnf("Model %s failed, falling back to %s", model.Name, models[i+1].Name)
    }
    
    return nil, fmt.Errorf("all models failed: %w", lastErr)
}
```

---

## 7. Observability & Monitoring

### 7.1 Real-Time Metrics Collection

**Prometheus-based Metrics:**

```go
type MetricsCollector struct {
    registry *prometheus.Registry
    
    // Request metrics
    requestCounter    *prometheus.CounterVec
    requestDuration   *prometheus.HistogramVec
    requestSize       *prometheus.HistogramVec
    
    // Token metrics
    tokenCounter      *prometheus.CounterVec
    tokenCost         *prometheus.CounterVec
    
    // Cache metrics
    cacheHitRatio     *prometheus.GaugeVec
    cacheSize         *prometheus.GaugeVec
    
    // Model metrics
    modelLatency      *prometheus.HistogramVec
    modelErrors       *prometheus.CounterVec
    
    // Quota metrics
    quotaUsage        *prometheus.GaugeVec
    quotaRemaining    *prometheus.GaugeVec
}

func NewMetricsCollector() *MetricsCollector {
    mc := &MetricsCollector{
        registry: prometheus.NewRegistry(),
    }
    
    // Request metrics
    mc.requestCounter = prometheus.NewCounterVec(
        prometheus.CounterOpts{
            Name: "llm_requests_total",
            Help: "Total number of LLM requests",
        },
        []string{"team_id", "model", "status", "priority"},
    )
    
    mc.requestDuration = prometheus.NewHistogramVec(
        prometheus.HistogramOpts{
            Name:    "llm_request_duration_seconds",
            Help:    "Request duration in seconds",
            Buckets: []float64{0.1, 0.5, 1, 2, 5, 10, 30},
        },
        []string{"team_id", "model"},
    )
    
    // Token metrics
    mc.tokenCounter = prometheus.NewCounterVec(
        prometheus.CounterOpts{
            Name: "llm_tokens_total",
            Help: "Total tokens consumed",
        },
        []string{"team_id", "model", "type"}, // type: prompt, completion
    )
    
    mc.tokenCost = prometheus.NewCounterVec(
        prometheus.CounterOpts{
            Name: "llm_cost_usd_total",
            Help: "Total cost in USD",
        },
        []string{"team_id", "model"},
    )
    
    // Cache metrics
    mc.cacheHitRatio = prometheus.NewGaugeVec(
        prometheus.GaugeOpts{
            Name: "llm_cache_hit_ratio",
            Help: "Cache hit ratio (0-1)",
        },
        []string{"team_id"},
    )
    
    // Register all metrics
    mc.registry.MustRegister(
        mc.requestCounter,
        mc.requestDuration,
        mc.tokenCounter,
        mc.tokenCost,
        mc.cacheHitRatio,
    )
    
    return mc
}

func (mc *MetricsCollector) RecordRequest(teamID, model string, latency time.Duration, cost Cost) {
    mc.requestCounter.WithLabelValues(teamID, model, "success", "medium").Inc()
    mc.requestDuration.WithLabelValues(teamID, model).Observe(latency.Seconds())
    mc.tokenCost.WithLabelValues(teamID, model).Add(cost.Amount)
}
```

### 7.2 Distributed Tracing

**OpenTelemetry Integration:**

```go
type TracingService struct {
    tracer trace.Tracer
}

func (g *LLMGateway) ProcessRequestWithTracing(ctx context.Context, req *InferenceRequest) (*InferenceResponse, error) {
    ctx, span := g.tracer.Start(ctx, "ProcessRequest",
        trace.WithAttributes(
            attribute.String("team_id", req.TeamID),
            attribute.String("model_hint", req.ModelHint),
            attribute.Int("max_tokens", req.MaxTokens),
        ),
    )
    defer span.End()
    
    // Authentication span
    ctx, authSpan := g.tracer.Start(ctx, "Authenticate")
    team, err := g.authService.Authenticate(ctx, req)
    authSpan.End()
    if err != nil {
        span.RecordError(err)
        return nil, err
    }
    
    // Rate limiting span
    ctx, rlSpan := g.tracer.Start(ctx, "RateLimit")
    allowed, err := g.rateLimiter.CheckAndConsume(ctx, team.ID, req)
    rlSpan.End()
    if !allowed {
        span.SetStatus(codes.Error, "rate limit exceeded")
        return nil, ErrRateLimitExceeded
    }
    
    // Cache lookup span
    ctx, cacheSpan := g.tracer.Start(ctx, "CacheLookup")
    cachedResp, found := g.cacheManager.Get(ctx, req)
    cacheSpan.SetAttributes(attribute.Bool("cache_hit", found))
    cacheSpan.End()
    
    if found {
        span.SetAttributes(attribute.Bool("cache_hit", true))
        return cachedResp, nil
    }
    
    // Model inference span
    ctx, inferSpan := g.tracer.Start(ctx, "ModelInference")
    model, _ := g.modelRouter.SelectModel(ctx, team, req)
    inferSpan.SetAttributes(attribute.String("model_selected", model.Name))
    
    resp, err := model.Generate(ctx, req)
    inferSpan.End()
    
    if err != nil {
        span.RecordError(err)
        return nil, err
    }
    
    span.SetAttributes(
        attribute.Int("tokens_used", resp.TokensUsed.TotalTokens),
        attribute.Float64("cost", cost.Amount),
    )
    
    return resp, nil
}
```

### 7.3 Alerting System

```go
type AlertManager struct {
    notifier     *Notifier
    alertStore   *AlertStore
    ruleEngine   *RuleEngine
}

type Alert struct {
    ID          string
    TeamID      string
    Type        AlertType
    Severity    Severity
    Message     string
    Timestamp   time.Time
    Metadata    map[string]interface{}
    Resolved    bool
}

type AlertType string
const (
    AlertTypeQuotaWarning     AlertType = "quota_warning"
    AlertTypeQuotaExceeded    AlertType = "quota_exceeded"
    AlertTypeCostAnomaly      AlertType = "cost_anomaly"
    AlertTypeHighLatency      AlertType = "high_latency"
    AlertTypeHighErrorRate    AlertType = "high_error_rate"
    AlertTypeModelUnavailable AlertType = "model_unavailable"
)

type Severity string
const (
    SeverityInfo     Severity = "info"
    SeverityWarning  Severity = "warning"
    SeverityCritical Severity = "critical"
)

// Alert rules
func (am *AlertManager) EvaluateAlerts(ctx context.Context) error {
    teams, _ := am.getTeams()
    
    for _, team := range teams {
        // Rule 1: Quota approaching limit (80%)
        usage := am.getUsage(team.ID)
        if usage.Percentage > 0.8 {
            am.SendAlert(team.ID, AlertTypeQuotaWarning, SeverityWarning, map[string]interface{}{
                "usage_percent": usage.Percentage * 100,
                "quota_remaining": team.Quotas.MonthlyTokenQuota - usage.TokensUsed,
            })
        }
        
        // Rule 2: Cost anomaly detection (3σ from baseline)
        if am.detectCostAnomaly(team.ID) {
            am.SendAlert(team.ID, AlertTypeCostAnomaly, SeverityCritical, map[string]interface{}{
                "current_cost": usage.CurrentCost,
                "baseline_cost": usage.BaselineCost,
                "deviation": usage.Deviation,
            })
        }
        
        // Rule 3: High error rate (>5%)
        errorRate := am.getErrorRate(team.ID)
        if errorRate > 0.05 {
            am.SendAlert(team.ID, AlertTypeHighErrorRate, SeverityCritical, map[string]interface{}{
                "error_rate": errorRate * 100,
                "error_count": usage.ErrorCount,
            })
        }
        
        // Rule 4: High latency (P95 > 5s)
        p95Latency := am.getP95Latency(team.ID)
        if p95Latency > 5*time.Second {
            am.SendAlert(team.ID, AlertTypeHighLatency, SeverityWarning, map[string]interface{}{
                "p95_latency_ms": p95Latency.Milliseconds(),
            })
        }
    }
    
    return nil
}

func (am *AlertManager) SendAlert(teamID string, alertType AlertType, severity Severity, metadata map[string]interface{}) {
    alert := &Alert{
        ID:        generateID(),
        TeamID:    teamID,
        Type:      alertType,
        Severity:  severity,
        Timestamp: time.Now(),
        Metadata:  metadata,
    }
    
    // Store alert
    am.alertStore.Save(alert)
    
    // Send notifications
    am.notifier.Notify(alert)
}
```

### 7.4 Dashboard & Visualization

**Grafana Dashboard Configuration:**

```yaml
# grafana-dashboard.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: llm-gateway-dashboard
data:
  dashboard.json: |
    {
      "dashboard": {
        "title": "LLM Gateway - Team Overview",
        "panels": [
          {
            "title": "Request Rate (req/s)",
            "targets": [{
              "expr": "rate(llm_requests_total{team_id=\"$team\"}[5m])"
            }]
          },
          {
            "title": "Token Usage (tokens/min)",
            "targets": [{
              "expr": "rate(llm_tokens_total{team_id=\"$team\"}[1m]) * 60"
            }]
          },
          {
            "title": "Cost per Hour (USD)",
            "targets": [{
              "expr": "rate(llm_cost_usd_total{team_id=\"$team\"}[1h]) * 3600"
            }]
          },
          {
            "title": "Cache Hit Ratio",
            "targets": [{
              "expr": "llm_cache_hit_ratio{team_id=\"$team\"}"
            }]
          },
          {
            "title": "P95 Latency by Model",
            "targets": [{
              "expr": "histogram_quantile(0.95, llm_request_duration_seconds{team_id=\"$team\"})"
            }]
          },
          {
            "title": "Quota Usage",
            "targets": [{
              "expr": "llm_quota_usage{team_id=\"$team\"} / llm_quota_limit{team_id=\"$team\"} * 100"
            }]
          }
        ]
      }
    }
```

---

## 8. Performance Optimization

### 8.1 Response Caching Strategy

**Multi-Layer Caching:**

```go
type CacheManager struct {
    exactCache    *ExactCache     // Redis for exact matches
    semanticCache *SemanticCache  // Vector DB for semantic similarity
    localCache    *LocalCache     // In-memory LRU cache
}

type CachePolicy string
const (
    CachePolicyNone      CachePolicy = "none"
    CachePolicyExact     CachePolicy = "exact"
    CachePolicySemantic  CachePolicy = "semantic"
    CachePolicyAggressive CachePolicy = "aggressive"
)

// Exact cache using Redis
type ExactCache struct {
    redis *redis.Client
    ttl   time.Duration
}

func (ec *ExactCache) Get(ctx context.Context, req *InferenceRequest) (*InferenceResponse, bool) {
    // Generate cache key from request
    key := ec.generateKey(req)
    
    // Lookup in Redis
    data, err := ec.redis.Get(ctx, key).Bytes()
    if err != nil {
        return nil, false
    }
    
    var resp InferenceResponse
    if err := json.Unmarshal(data, &resp); err != nil {
        return nil, false
    }
    
    return &resp, true
}

func (ec *ExactCache) Set(ctx context.Context, req *InferenceRequest, resp *InferenceResponse) error {
    key := ec.generateKey(req)
    data, _ := json.Marshal(resp)
    
    return ec.redis.Set(ctx, key, data, ec.ttl).Err()
}

func (ec *ExactCache) generateKey(req *InferenceRequest) string {
    // Hash of prompt + model + parameters
    h := sha256.New()
    h.Write([]byte(req.Prompt))
    h.Write([]byte(req.ModelHint))
    h.Write([]byte(fmt.Sprintf("%d%.2f", req.MaxTokens, req.Temperature)))
    return fmt.Sprintf("cache:exact:%x", h.Sum(nil))
}

// Semantic cache using vector similarity
type SemanticCache struct {
    vectorDB    *VectorDB
    embedder    *Embedder
    threshold   float64  // Similarity threshold (0.9 = 90% similar)
}

func (sc *SemanticCache) Get(ctx context.Context, req *InferenceRequest) (*InferenceResponse, bool) {
    // Generate embedding for prompt
    embedding, err := sc.embedder.Embed(req.Prompt)
    if err != nil {
        return nil, false
    }
    
    // Search for similar prompts
    results, err := sc.vectorDB.Search(ctx, embedding, 1)
    if err != nil || len(results) == 0 {
        return nil, false
    }
    
    // Check similarity threshold
    if results[0].Similarity < sc.threshold {
        return nil, false
    }
    
    // Return cached response
    return results[0].Response, true
}

func (sc *SemanticCache) Set(ctx context.Context, req *InferenceRequest, resp *InferenceResponse) error {
    embedding, err := sc.embedder.Embed(req.Prompt)
    if err != nil {
        return err
    }
    
    return sc.vectorDB.Insert(ctx, embedding, resp)
}

// Cache warming for common queries
func (cm *CacheManager) WarmCache(ctx context.Context) error {
    commonQueries := cm.getCommonQueries()
    
    for _, query := range commonQueries {
        // Check if already cached
        if _, found := cm.Get(ctx, query); found {
            continue
        }
        
        // Generate and cache response
        resp, err := cm.generateResponse(ctx, query)
        if err != nil {
            continue
        }
        
        cm.Set(ctx, query, resp)
    }
    
    return nil
}
```

### 8.2 Request Batching

```go
type BatchProcessor struct {
    batchSize    int
    batchTimeout time.Duration
    queue        chan *InferenceRequest
    responses    map[string]chan *InferenceResponse
    mu           sync.RWMutex
}

func (bp *BatchProcessor) ProcessBatch(ctx context.Context) {
    ticker := time.NewTicker(bp.batchTimeout)
    defer ticker.Stop()
    
    batch := make([]*InferenceRequest, 0, bp.batchSize)
    
    for {
        select {
        case req := <-bp.queue:
            batch = append(batch, req)
            
            if len(batch) >= bp.batchSize {
                bp.executeBatch(ctx, batch)
                batch = batch[:0]
            }
            
        case <-ticker.C:
            if len(batch) > 0 {
                bp.executeBatch(ctx, batch)
                batch = batch[:0]
            }
            
        case <-ctx.Done():
            return
        }
    }
}

func (bp *BatchProcessor) executeBatch(ctx context.Context, batch []*InferenceRequest) {
    // Combine prompts for batch inference
    combinedPrompt := bp.combinePrompts(batch)
    
    // Execute batch inference
    resp, err := bp.model.GenerateBatch(ctx, combinedPrompt)
    if err != nil {
        // Handle error for all requests
        for _, req := range batch {
            bp.sendResponse(req.RequestID, nil, err)
        }
        return
    }
    
    // Split responses
    responses := bp.splitResponses(resp, len(batch))
    
    // Send individual responses
    for i, req := range batch {
        bp.sendResponse(req.RequestID, responses[i], nil)
    }
}
```

### 8.3 Connection Pooling & Load Balancing

```go
type ModelPool struct {
    models    []*ModelInstance
    strategy  LoadBalancingStrategy
    mu        sync.RWMutex
}

type LoadBalancingStrategy string
const (
    StrategyRoundRobin    LoadBalancingStrategy = "round_robin"
    StrategyLeastLatency  LoadBalancingStrategy = "least_latency"
    StrategyLeastLoad     LoadBalancingStrategy = "least_load"
)

type ModelInstance struct {
    ID            string
    Endpoint      string
    CurrentLoad   int32
    AvgLatency    time.Duration
    Healthy       bool
    LastHealthCheck time.Time
}

func (mp *ModelPool) GetInstance() (*ModelInstance, error) {
    mp.mu.RLock()
    defer mp.mu.RUnlock()
    
    switch mp.strategy {
    case StrategyRoundRobin:
        return mp.roundRobin()
    case StrategyLeastLatency:
        return mp.leastLatency()
    case StrategyLeastLoad:
        return mp.leastLoad()
    default:
        return mp.roundRobin()
    }
}

func (mp *ModelPool) leastLoad() (*ModelInstance, error) {
    var best *ModelInstance
    minLoad := int32(math.MaxInt32)
    
    for _, instance := range mp.models {
        if !instance.Healthy {
            continue
        }
        
        load := atomic.LoadInt32(&instance.CurrentLoad)
        if load < minLoad {
            minLoad = load
            best = instance
        }
    }
    
    if best == nil {
        return nil, ErrNoHealthyInstances
    }
    
    atomic.AddInt32(&best.CurrentLoad, 1)
    return best, nil
}

// Health checking
func (mp *ModelPool) HealthCheck(ctx context.Context) {
    ticker := time.NewTicker(30 * time.Second)
    defer ticker.Stop()
    
    for {
        select {
        case <-ticker.C:
            for _, instance := range mp.models {
                go mp.checkInstance(ctx, instance)
            }
        case <-ctx.Done():
            return
        }
    }
}

func (mp *ModelPool) checkInstance(ctx context.Context, instance *ModelInstance) {
    ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
    defer cancel()
    
    start := time.Now()
    err := instance.Ping(ctx)
    latency := time.Since(start)
    
    mp.mu.Lock()
    defer mp.mu.Unlock()
    
    instance.LastHealthCheck = time.Now()
    instance.Healthy = (err == nil)
    
    if err == nil {
        // Update average latency (exponential moving average)
        alpha := 0.3
        instance.AvgLatency = time.Duration(
            alpha*float64(latency) + (1-alpha)*float64(instance.AvgLatency),
        )
    }
}
```

---

## 9. Scalability & Reliability

### 9.1 Horizontal Scaling Architecture

```yaml
# kubernetes-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: llm-gateway
spec:
  replicas: 10  # Auto-scaled based on load
  selector:
    matchLabels:
      app: llm-gateway
  template:
    metadata:
      labels:
        app: llm-gateway
    spec:
      containers:
      - name: gateway
        image: llm-gateway:v1.0
        resources:
          requests:
            cpu: "2"
            memory: "4Gi"
          limits:
            cpu: "4"
            memory: "8Gi"
        env:
        - name: REDIS_URL
          valueFrom:
            secretKeyRef:
              name: redis-credentials
              key: url
        - name: DB_CONNECTION
          valueFrom:
            secretKeyRef:
              name: db-credentials
              key: connection_string
        livenessProbe:
          httpGet:
            path: /health
            port: 8080
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /ready
            port: 8080
          initialDelaySeconds: 5
          periodSeconds: 5
---
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: llm-gateway-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: llm-gateway
  minReplicas: 5
  maxReplicas: 50
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
  - type: Pods
    pods:
      metric:
        name: llm_requests_per_second
      target:
        type: AverageValue
        averageValue: "100"
```

### 9.2 Database Sharding Strategy

```go
type ShardedDatabase struct {
    shards    []*DatabaseShard
    hasher    *ConsistentHash
}

type DatabaseShard struct {
    ID         int
    Connection *sql.DB
    Region     string
}

func (sd *ShardedDatabase) GetShard(teamID string) *DatabaseShard {
    shardID := sd.hasher.GetShard(teamID)
    return sd.shards[shardID]
}

func (sd *ShardedDatabase) InsertUsageRecord(ctx context.Context, record *UsageRecord) error {
    shard := sd.GetShard(record.TeamID)
    
    query := `
        INSERT INTO usage_records 
        (id, timestamp, team_id, project_id, model_name, tokens, cost)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
    `
    
    _, err := shard.Connection.ExecContext(ctx, query,
        record.ID,
        record.Timestamp,
        record.TeamID,
        record.ProjectID,
        record.ModelName,
        record.TotalTokens,
        record.Cost,
    )
    
    return err
}

// Consistent hashing for even distribution
type ConsistentHash struct {
    ring       map[uint32]int
    sortedKeys []uint32
    replicas   int
}

func (ch *ConsistentHash) GetShard(key string) int {
    hash := ch.hash(key)
    
    idx := sort.Search(len(ch.sortedKeys), func(i int) bool {
        return ch.sortedKeys[i] >= hash
    })
    
    if idx == len(ch.sortedKeys) {
        idx = 0
    }
    
    return ch.ring[ch.sortedKeys[idx]]
}
```

### 9.3 Disaster Recovery

```go
type DisasterRecovery struct {
    primaryRegion   string
    backupRegions   []string
    replicationMgr  *ReplicationManager
    failoverMgr     *FailoverManager
}

// Multi-region replication
func (dr *DisasterRecovery) ReplicateData(ctx context.Context, data interface{}) error {
    // Write to primary
    if err := dr.writeToPrimary(ctx, data); err != nil {
        return err
    }
    
    // Async replication to backups
    for _, region := range dr.backupRegions {
        go dr.replicateToRegion(ctx, region, data)
    }
    
    return nil
}

// Automatic failover
func (dr *DisasterRecovery) MonitorHealth(ctx context.Context) {
    ticker := time.NewTicker(10 * time.Second)
    defer ticker.Stop()
    
    for {
        select {
        case <-ticker.C:
            if !dr.isPrimaryHealthy() {
                dr.failoverMgr.InitiateFailover(ctx)
            }
        case <-ctx.Done():
            return
        }
    }
}
```

---

## 10. Security & Compliance

### 10.1 PII Detection & Redaction

```go
type PIIDetector struct {
    patterns map[string]*regexp.Regexp
    ml       *MLClassifier
}

func NewPIIDetector() *PIIDetector {
    return &PIIDetector{
        patterns: map[string]*regexp.Regexp{
            "email":      regexp.MustCompile(`[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}`),
            "phone":      regexp.MustCompile(`\b\d{3}[-.]?\d{3}[-.]?\d{4}\b`),
            "ssn":        regexp.MustCompile(`\b\d{3}-\d{2}-\d{4}\b`),
            "credit_card": regexp.MustCompile(`\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b`),
            "ip_address": regexp.MustCompile(`\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b`),
        },
    }
}

func (pd *PIIDetector) DetectAndRedact(text string) (string, []PIIMatch) {
    var matches []PIIMatch
    redacted := text
    
    for piiType, pattern := range pd.patterns {
        found := pattern.FindAllString(text, -1)
        for _, match := range found {
            matches = append(matches, PIIMatch{
                Type:  piiType,
                Value: match,
            })
            
            // Redact with placeholder
            redacted = strings.ReplaceAll(redacted, match, fmt.Sprintf("[%s_REDACTED]", strings.ToUpper(piiType)))
        }
    }
    
    return redacted, matches
}

type PIIMatch struct {
    Type  string
    Value string
}

// Async PII scanning and logging
func (pd *PIIDetector) ScanAndLog(ctx context.Context, req *InferenceRequest) {
    redacted, matches := pd.DetectAndRedact(req.Prompt)
    
    if len(matches) > 0 {
        // Log PII detection
        log.Warnf("PII detected in request %s: %d matches", req.RequestID, len(matches))
        
        // Store audit log
        pd.auditLog.LogPIIDetection(ctx, req.TeamID, req.RequestID, matches)
        
        // Alert if sensitive data detected
        if pd.containsSensitivePII(matches) {
            pd.alertManager.SendAlert(req.TeamID, AlertTypePIIDetected, SeverityCritical, map[string]interface{}{
                "request_id": req.RequestID,
                "pii_types":  pd.getPIITypes(matches),
            })
        }
    }
}
```

### 10.2 Audit Logging

```go
type AuditLogger struct {
    db        *sql.DB
    encryptor *Encryptor
}

type AuditLog struct {
    ID          string
    Timestamp   time.Time
    TeamID      string
    UserID      string
    Action      string
    Resource    string
    Status      string
    IPAddress   string
    UserAgent   string
    Metadata    map[string]interface{}
}

func (al *AuditLogger) LogAuth(req *InferenceRequest, team *Team, userID string) {
    log := &AuditLog{
        ID:        generateID(),
        Timestamp: time.Now(),
        TeamID:    team.ID,
        UserID:    userID,
        Action:    "authenticate",
        Resource:  "llm_gateway",
        Status:    "success",
        IPAddress: req.IPAddress,
        UserAgent: req.UserAgent,
    }
    
    al.store(log)
}

func (al *AuditLogger) LogInference(req *InferenceRequest, resp *InferenceResponse) {
    // Encrypt sensitive data
    encryptedPrompt := al.encryptor.Encrypt(req.Prompt)
    encryptedResponse := al.encryptor.Encrypt(resp.Response)
    
    log := &AuditLog{
        ID:        generateID(),
        Timestamp: time.Now(),
        TeamID:    req.TeamID,
        UserID:    req.UserID,
        Action:    "inference",
        Resource:  resp.ModelUsed,
        Status:    "success",
        Metadata: map[string]interface{}{
            "request_id":      req.RequestID,
            "tokens_used":     resp.TokensUsed.TotalTokens,
            "cost":            resp.Cost.Amount,
            "latency_ms":      resp.Latency.Milliseconds(),
            "encrypted_prompt": encryptedPrompt,
            "encrypted_response": encryptedResponse,
        },
    }
    
    al.store(log)
}

// Compliance reporting
func (al *AuditLogger) GenerateComplianceReport(teamID string, period Period) (*ComplianceReport, error) {
    logs, err := al.queryLogs(teamID, period)
    if err != nil {
        return nil, err
    }
    
    report := &ComplianceReport{
        TeamID:          teamID,
        Period:          period,
        TotalRequests:   len(logs),
        PIIDetections:   al.countPIIDetections(logs),
        FailedAuths:     al.countFailedAuths(logs),
        AnomalousAccess: al.detectAnomalies(logs),
    }
    
    return report, nil
}
```

### 10.3 API Key Management

```go
type APIKeyManager struct {
    store     *APIKeyStore
    encryptor *Encryptor
    rotator   *KeyRotator
}

type APIKey struct {
    ID          string
    TeamID      string
    Key         string  // Hashed
    Name        string
    Permissions []string
    CreatedAt   time.Time
    ExpiresAt   time.Time
    LastUsed    time.Time
    Revoked     bool
}

func (akm *APIKeyManager) CreateKey(teamID, name string, permissions []string) (*APIKey, error) {
    // Generate secure random key
    keyBytes := make([]byte, 32)
    if _, err := rand.Read(keyBytes); err != nil {
        return nil, err
    }
    
    rawKey := base64.URLEncoding.EncodeToString(keyBytes)
    hashedKey := akm.hashKey(rawKey)
    
    apiKey := &APIKey{
        ID:          generateID(),
        TeamID:      teamID,
        Key:         hashedKey,
        Name:        name,
        Permissions: permissions,
        CreatedAt:   time.Now(),
        ExpiresAt:   time.Now().Add(365 * 24 * time.Hour), // 1 year
        Revoked:     false,
    }
    
    if err := akm.store.Save(apiKey); err != nil {
        return nil, err
    }
    
    // Return key with raw value (only time it's visible)
    apiKey.Key = rawKey
    return apiKey, nil
}

func (akm *APIKeyManager) RotateKeys(ctx context.Context) error {
    // Automatic key rotation for keys older than 90 days
    oldKeys, err := akm.store.GetKeysOlderThan(90 * 24 * time.Hour)
    if err != nil {
        return err
    }
    
    for _, key := range oldKeys {
        // Create new key
        newKey, err := akm.CreateKey(key.TeamID, key.Name+"_rotated", key.Permissions)
        if err != nil {
            continue
        }
        
        // Notify team
        akm.notifyKeyRotation(key.TeamID, key.ID, newKey.ID)
        
        // Schedule old key for deletion (grace period)
        akm.scheduleKeyDeletion(key.ID, 30*24*time.Hour)
    }
    
    return nil
}
```

---

## 11. Trade-offs & Design Decisions

### 11.1 Synchronous vs Asynchronous Processing

**Decision**: Hybrid approach
- **Synchronous**: Authentication, rate limiting, cache lookup, inference
- **Asynchronous**: PII detection, metrics logging, cache updates, billing

**Trade-offs**:
- ✅ **Pros**: Lower latency for critical path, better throughput
- ❌ **Cons**: Eventual consistency for metrics, potential data loss on crashes
- **Mitigation**: Use message queues (Kafka) for async operations with retry logic

### 11.2 Caching Strategy

**Decision**: Multi-layer caching (Local LRU + Redis + Semantic)

**Trade-offs**:

| Approach | Pros | Cons | When to Use |
|----------|------|------|-------------|
| **No Cache** | Simple, always fresh | High cost, high latency | Unique queries only |
| **Exact Match** | Fast, deterministic | Low hit rate | Repeated queries |
| **Semantic** | High hit rate | Complex, approximate | Similar queries |
| **Multi-layer** | Best of both | Complex, overhead | Production systems |

**Choice**: Multi-layer for 70%+ hit rate target

### 11.3 Rate Limiting Algorithm

**Decision**: Token Bucket + Sliding Window

**Alternatives Considered**:
```text
Fixed Window:
  ✅ Simple implementation
  ❌ Burst at window boundaries
  
Sliding Window:
  ✅ Smooth rate limiting
  ❌ Higher memory usage
  
Token Bucket:
  ✅ Allows bursts
  ✅ Fair over time
  ❌ Complex implementation
  
Leaky Bucket:
  ✅ Smooth output
  ❌ Doesn't allow bursts
```

**Choice**: Token Bucket for TPM (allows bursts) + Sliding Window for RPS (smooth)

### 11.4 Database Choice

**Decision**: PostgreSQL (sharded) for usage records, Redis for rate limiting

**Trade-offs**:
- **PostgreSQL**: ACID compliance, complex queries, slower writes
- **Cassandra**: High write throughput, eventual consistency, complex ops
- **MongoDB**: Flexible schema, good for logs, weaker consistency
- **Redis**: Ultra-fast, in-memory, limited persistence

**Choice**: PostgreSQL for reliability + Redis for performance

### 11.5 Model Selection Strategy

**Decision**: Automatic with manual override

**Scoring Factors**:
```text
Cost Efficiency:     40% weight
Performance:         30% weight
Capability Match:    20% weight
Availability:        10% weight
```

**Trade-offs**:
- ✅ **Pros**: Cost optimization, better UX, reduced decision fatigue
- ❌ **Cons**: Potential suboptimal choices, complexity
- **Mitigation**: Allow manual model hints, continuous learning from feedback

### 11.6 Multi-Tenancy Isolation

**Decision**: Logical isolation with shared infrastructure

**Alternatives**:
```text
Physical Isolation (Separate Clusters):
  ✅ Complete isolation
  ❌ High cost, operational overhead
  
Logical Isolation (Shared Cluster):
  ✅ Cost efficient, easier ops
  ❌ Noisy neighbor risk
  
Hybrid (Critical teams isolated):
  ✅ Balance cost and isolation
  ❌ Complex management
```

**Choice**: Logical isolation with quota enforcement + circuit breakers

### 11.7 Observability Granularity

**Decision**: Request-level tracing with sampling

**Trade-offs**:
- **100% Tracing**: Complete visibility, high overhead (5-10% latency)
- **Sampling (10%)**: Low overhead, statistical accuracy
- **Error-only**: Minimal overhead, miss patterns

**Choice**: 10% sampling + 100% error tracing

## 12. Key Metrics & SLAs

### 12.1 Performance SLAs

```yaml
Latency:
  P50: < 100ms (gateway overhead)
  P95: < 200ms (gateway overhead)
  P99: < 500ms (gateway overhead)

Throughput:
  Target: 10,000 req/s
  Peak: 50,000 req/s (with auto-scaling)

Availability:
  Target: 99.9% (8.76 hours downtime/year)
  Stretch: 99.95% (4.38 hours downtime/year)
```

### 12.2 Cost Efficiency Metrics

```yaml
Cache Hit Rate:
  Target: 70%
  Minimum: 50%

Cost Reduction:
  Target: 30% vs no optimization
  Mechanisms:
    - Caching: 15-20%
    - Model downgrading: 10-15%
    - Batching: 5-10%

Resource Utilization:
  CPU: 60-80% (optimal range)
  Memory: 70-85% (optimal range)
  Cache: 80-90% (optimal range)
```

### 12.3 Business Metrics

```yaml
Team Satisfaction:
  Response Time: < 2s for 95% of requests
  Error Rate: < 0.1%
  Support Tickets: < 5 per team per month

Cost Attribution:
  Accuracy: 99.9%
  Granularity: Per-request level
  Reporting Latency: < 1 hour

Governance:
  Quota Compliance: 100%
  PII Detection Rate: > 95%
  Audit Coverage: 100%
```

---

## 13. Conclusion

This production-grade multi-tenant LLM serving platform addresses all critical pain points:

### 13.1 Problems Solved

1. **💸 Budget Control**: Token-level cost attribution with real-time tracking
2. **⚡ Fair Resource Allocation**: Multi-dimensional rate limiting prevents noisy neighbors
3. **🎯 Model Governance**: Tiered access with intelligent routing reduces waste
4. **📊 Accountability**: Comprehensive observability and chargeback reporting
5. **🔒 Security & Compliance**: PII detection, audit logging, and compliance controls

### 13.2 Technical Highlights

- **Scalability**: Horizontal scaling to 100+ teams, 1M+ requests/day
- **Performance**: P95 latency < 200ms, 70%+ cache hit rate
- **Reliability**: 99.9% uptime with multi-region disaster recovery
- **Cost Efficiency**: 30-40% cost reduction through optimization
- **Security**: SOC2/HIPAA compliant with comprehensive audit trails
---

## 14. Common Production Issues & Solutions

### 14.1 Issue 1: Rate Limit Thundering Herd

**Problem**: When quotas reset (e.g., at midnight), all teams simultaneously send requests, causing a spike that overwhelms the system.

**Symptoms**:
- Sudden 10x spike in traffic at quota reset time
- Gateway timeouts and 503 errors
- Redis connection pool exhaustion
- Database write bottleneck

**Root Cause**:
```go
// BAD: All quotas reset at exact same time
func resetQuotas() {
    for _, team := range teams {
        redis.Set(fmt.Sprintf("quota:%s", team.ID), 0)  // All at midnight
    }
}
```

**Solution**:
```go
// GOOD: Staggered quota resets with jitter
func resetQuotasWithJitter() {
    for _, team := range teams {
        // Add random jitter (0-60 minutes)
        jitter := time.Duration(rand.Intn(3600)) * time.Second
        resetTime := getNextResetTime().Add(jitter)
        
        scheduler.ScheduleAt(resetTime, func() {
            redis.Set(fmt.Sprintf("quota:%s", team.ID), 0)
        })
    }
}

// Alternative: Rolling window instead of fixed window
func useRollingWindow(teamID string) int {
    now := time.Now().Unix()
    windowStart := now - 86400  // 24 hours ago
    
    // Count tokens in rolling 24-hour window
    return redis.ZCount(
        fmt.Sprintf("tokens:%s", teamID),
        windowStart,
        now,
    )
}
```

**Prevention**:
- Use rolling windows instead of fixed windows
- Implement gradual quota increases
- Add request queuing with backpressure

---

### 14.2 Issue 2: Cache Stampede

**Problem**: When a popular cached item expires, multiple requests simultaneously try to regenerate it, causing duplicate expensive LLM calls.

**Symptoms**:
- Sudden cost spikes for same prompt
- Multiple identical requests to LLM provider
- Cache hit ratio drops during high traffic
- P99 latency spikes

**Root Cause**:
```go
// BAD: No protection against simultaneous cache misses
func getResponse(prompt string) (*Response, error) {
    cached, found := cache.Get(prompt)
    if found {
        return cached, nil
    }
    
    // Multiple goroutines execute this simultaneously
    resp, err := llm.Generate(prompt)
    cache.Set(prompt, resp)
    return resp, err
}
```

**Solution**:
```go
// GOOD: Use singleflight pattern
import "golang.org/x/sync/singleflight"

type CacheManager struct {
    cache       *Cache
    sfGroup     singleflight.Group
}

func (cm *CacheManager) GetResponse(prompt string) (*Response, error) {
    // Check cache first
    if cached, found := cm.cache.Get(prompt); found {
        return cached, nil
    }
    
    // Use singleflight to deduplicate concurrent requests
    result, err, shared := cm.sfGroup.Do(prompt, func() (interface{}, error) {
        // Only one goroutine executes this
        resp, err := llm.Generate(prompt)
        if err != nil {
            return nil, err
        }
        
        // Cache with probabilistic early expiration to prevent stampede
        ttl := baseTTL + time.Duration(rand.Intn(300))*time.Second
        cm.cache.SetWithTTL(prompt, resp, ttl)
        
        return resp, nil
    })
    
    if err != nil {
        return nil, err
    }
    
    metrics.RecordCacheSharing(shared)
    return result.(*Response), nil
}

// Alternative: Probabilistic early recomputation
func (cm *CacheManager) GetWithEarlyRecompute(prompt string) (*Response, error) {
    cached, ttl, found := cm.cache.GetWithTTL(prompt)
    
    if found {
        // Recompute probabilistically before expiration
        // Probability increases as TTL decreases
        delta := baseTTL - ttl
        beta := 1.0
        probability := beta * math.Log(rand.Float64()) * delta
        
        if probability < 0 {
            // Async recompute
            go cm.recompute(prompt)
        }
        
        return cached, nil
    }
    
    return cm.compute(prompt)
}
```

**Prevention**:
- Implement singleflight pattern
- Use probabilistic early expiration
- Add cache warming for popular queries
- Monitor cache miss patterns

---

### 14.3 Issue 3: Token Estimation Inaccuracy

**Problem**: Pre-request token estimation is inaccurate, causing quota exhaustion or over-provisioning.

**Symptoms**:
- Teams hit quota limits unexpectedly
- Actual costs differ significantly from estimates
- Rate limiting triggers incorrectly
- Budget alerts fire prematurely

**Root Cause**:
```go
// BAD: Naive token estimation
func estimateTokens(prompt string) int {
    // Assumes 1 token = 4 characters (very inaccurate)
    return len(prompt) / 4
}
```

**Solution**:
```go
// GOOD: Use actual tokenizer
import "github.com/tiktoken-go/tokenizer"

type TokenEstimator struct {
    tokenizers map[string]*tokenizer.Tokenizer
    cache      *sync.Map  // Cache tokenization results
}

func (te *TokenEstimator) EstimateTokens(prompt string, model string) int {
    // Check cache first
    cacheKey := fmt.Sprintf("%s:%s", model, hashPrompt(prompt))
    if cached, ok := te.cache.Load(cacheKey); ok {
        return cached.(int)
    }
    
    // Get appropriate tokenizer for model
    tok := te.tokenizers[model]
    if tok == nil {
        tok = te.tokenizers["default"]
    }
    
    // Actual tokenization
    tokens := tok.Encode(prompt)
    count := len(tokens)
    
    // Cache result
    te.cache.Store(cacheKey, count)
    
    return count
}

// Track estimation accuracy
func (te *TokenEstimator) RecordActual(estimatedTokens, actualTokens int, model string) {
    accuracy := float64(estimatedTokens) / float64(actualTokens)
    
    metrics.RecordTokenEstimationAccuracy(model, accuracy)
    
    // Alert if accuracy degrades
    if accuracy < 0.8 || accuracy > 1.2 {
        alerts.Send(AlertTokenEstimationDrift, map[string]interface{}{
            "model":     model,
            "accuracy":  accuracy,
            "estimated": estimatedTokens,
            "actual":    actualTokens,
        })
    }
}

// Adaptive estimation with feedback loop
type AdaptiveEstimator struct {
    baseEstimator *TokenEstimator
    corrections   map[string]float64  // model -> correction factor
    mu            sync.RWMutex
}

func (ae *AdaptiveEstimator) Estimate(prompt string, model string) int {
    baseEstimate := ae.baseEstimator.EstimateTokens(prompt, model)
    
    ae.mu.RLock()
    correction := ae.corrections[model]
    ae.mu.RUnlock()
    
    if correction == 0 {
        correction = 1.0
    }
    
    return int(float64(baseEstimate) * correction)
}

func (ae *AdaptiveEstimator) UpdateCorrection(model string, estimated, actual int) {
    ratio := float64(actual) / float64(estimated)
    
    ae.mu.Lock()
    defer ae.mu.Unlock()
    
    // Exponential moving average
    alpha := 0.1
    if current, exists := ae.corrections[model]; exists {
        ae.corrections[model] = alpha*ratio + (1-alpha)*current
    } else {
        ae.corrections[model] = ratio
    }
}
```

**Prevention**:
- Use actual tokenizers (tiktoken, sentencepiece)
- Implement feedback loop for estimation accuracy
- Track and alert on estimation drift
- Add buffer to quota calculations (10-15%)

---

### 14.4 Issue 4: Database Connection Pool Exhaustion

**Problem**: High request volume exhausts database connections, causing timeouts and failures.

**Symptoms**:
- "Too many connections" errors
- Slow database queries
- Request timeouts
- Connection wait times increasing

**Root Cause**:
```go
// BAD: No connection pooling or limits
db, _ := sql.Open("postgres", connString)
// Default pool size may be too small
```

**Solution**:
```go
// GOOD: Properly configured connection pool
func setupDatabase(connString string) (*sql.DB, error) {
    db, err := sql.Open("postgres", connString)
    if err != nil {
        return nil, err
    }
    
    // Configure connection pool
    db.SetMaxOpenConns(100)           // Max connections
    db.SetMaxIdleConns(25)            // Idle connections
    db.SetConnMaxLifetime(5 * time.Minute)  // Connection lifetime
    db.SetConnMaxIdleTime(1 * time.Minute)  // Idle timeout
    
    // Verify connection
    if err := db.Ping(); err != nil {
        return nil, err
    }
    
    return db, nil
}

// Use connection pooling with retries
func (s *Store) InsertWithRetry(ctx context.Context, record *UsageRecord) error {
    var err error
    maxRetries := 3
    
    for i := 0; i < maxRetries; i++ {
        err = s.insert(ctx, record)
        if err == nil {
            return nil
        }
        
        // Check if it's a connection error
        if isConnectionError(err) {
            backoff := time.Duration(math.Pow(2, float64(i))) * 100 * time.Millisecond
            time.Sleep(backoff)
            continue
        }
        
        // Non-retryable error
        return err
    }
    
    return fmt.Errorf("max retries exceeded: %w", err)
}

// Monitor connection pool health
func (s *Store) MonitorPoolHealth(ctx context.Context) {
    ticker := time.NewTicker(30 * time.Second)
    defer ticker.Stop()
    
    for {
        select {
        case <-ticker.C:
            stats := s.db.Stats()
            
            metrics.RecordDBPoolStats(
                stats.OpenConnections,
                stats.InUse,
                stats.Idle,
                stats.WaitCount,
                stats.WaitDuration,
            )
            
            // Alert if pool is saturated
            utilization := float64(stats.InUse) / float64(stats.MaxOpenConnections)
            if utilization > 0.9 {
                alerts.Send(AlertDBPoolSaturation, map[string]interface{}{
                    "utilization": utilization,
                    "in_use":      stats.InUse,
                    "max_conns":   stats.MaxOpenConnections,
                })
            }
            
        case <-ctx.Done():
            return
        }
    }
}
```

**Prevention**:
- Configure appropriate pool sizes
- Implement connection retry logic
- Monitor pool utilization
- Use read replicas for read-heavy workloads
- Consider connection poolers (PgBouncer)

---

### 14.5 Issue 5: Redis Memory Exhaustion

**Problem**: Redis runs out of memory due to unbounded cache growth or rate limiting data.

**Symptoms**:
- Redis OOM errors
- Eviction of important data
- Rate limiting failures
- Cache hit ratio drops

**Root Cause**:
```go
// BAD: No TTL or eviction policy
redis.Set(key, value)  // Never expires
```

**Solution**:
```go
// GOOD: Proper TTL and eviction policies
type RedisManager struct {
    client *redis.Client
}

func (rm *RedisManager) SetWithTTL(key string, value interface{}, ttl time.Duration) error {
    // Always set TTL
    return rm.client.Set(context.Background(), key, value, ttl).Err()
}

// Configure Redis with appropriate eviction policy
func setupRedis(addr string) (*redis.Client, error) {
    client := redis.NewClient(&redis.Options{
        Addr:         addr,
        MaxRetries:   3,
        PoolSize:     100,
        MinIdleConns: 10,
    })
    
    // Set eviction policy
    client.ConfigSet(context.Background(), "maxmemory-policy", "allkeys-lru")
    
    // Set max memory (e.g., 4GB)
    client.ConfigSet(context.Background(), "maxmemory", "4gb")
    
    return client, nil
}

// Monitor Redis memory usage
func (rm *RedisManager) MonitorMemory(ctx context.Context) {
    ticker := time.NewTicker(1 * time.Minute)
    defer ticker.Stop()
    
    for {
        select {
        case <-ticker.C:
            info, err := rm.client.Info(ctx, "memory").Result()
            if err != nil {
                continue
            }
            
            // Parse memory stats
            usedMemory := parseMemoryStat(info, "used_memory")
            maxMemory := parseMemoryStat(info, "maxmemory")
            
            utilization := float64(usedMemory) / float64(maxMemory)
            
            metrics.RecordRedisMemory(usedMemory, maxMemory, utilization)
            
            // Alert if memory is high
            if utilization > 0.85 {
                alerts.Send(AlertRedisMemoryHigh, map[string]interface{}{
                    "utilization": utilization,
                    "used_mb":     usedMemory / 1024 / 1024,
                    "max_mb":      maxMemory / 1024 / 1024,
                })
            }
            
        case <-ctx.Done():
            return
        }
    }
}

// Implement key namespacing and cleanup
func (rm *RedisManager) CleanupOldKeys(ctx context.Context) error {
    // Find keys older than threshold
    cursor := uint64(0)
    pattern := "rps:*"  // Rate limiting keys
    threshold := time.Now().Add(-24 * time.Hour).Unix()
    
    for {
        keys, nextCursor, err := rm.client.Scan(ctx, cursor, pattern, 100).Result()
        if err != nil {
            return err
        }
        
        for _, key := range keys {
            // Check if key is old
            ttl := rm.client.TTL(ctx, key).Val()
            if ttl == -1 {  // No TTL set
                rm.client.Expire(ctx, key, 1*time.Hour)
            }
        }
        
        cursor = nextCursor
        if cursor == 0 {
            break
        }
    }
    
    return nil
}
```

**Prevention**:
- Always set TTLs on keys
- Configure eviction policies (allkeys-lru)
- Set maxmemory limits
- Monitor memory usage
- Implement key cleanup jobs
- Use Redis Cluster for horizontal scaling

---

### 14.6 Issue 6: Model Provider Rate Limits

**Problem**: Hitting rate limits from LLM providers (OpenAI, Anthropic) causing request failures.

**Symptoms**:
- 429 "Too Many Requests" errors
- Requests failing for all teams
- Cascading failures
- User-facing errors

**Root Cause**:
```go
// BAD: No rate limiting or retry logic for provider
resp, err := openai.CreateCompletion(req)
if err != nil {
    return err  // Fails immediately
}
```

**Solution**:
```go
// GOOD: Implement provider-level rate limiting and retries
type ProviderRateLimiter struct {
    limiter   *rate.Limiter
    semaphore chan struct{}
}

func NewProviderRateLimiter(rps int, maxConcurrent int) *ProviderRateLimiter {
    return &ProviderRateLimiter{
        limiter:   rate.NewLimiter(rate.Limit(rps), rps),
        semaphore: make(chan struct{}, maxConcurrent),
    }
}

func (prl *ProviderRateLimiter) Execute(ctx context.Context, fn func() error) error {
    // Wait for rate limit
    if err := prl.limiter.Wait(ctx); err != nil {
        return err
    }
    
    // Acquire semaphore for concurrency control
    select {
    case prl.semaphore <- struct{}{}:
        defer func() { <-prl.semaphore }()
    case <-ctx.Done():
        return ctx.Err()
    }
    
    return fn()
}

// Exponential backoff with jitter
type RetryConfig struct {
    MaxRetries int
    BaseDelay  time.Duration
    MaxDelay   time.Duration
}

func (m *ModelClient) CallWithRetry(ctx context.Context, req *Request) (*Response, error) {
    config := RetryConfig{
        MaxRetries: 5,
        BaseDelay:  100 * time.Millisecond,
        MaxDelay:   30 * time.Second,
    }
    
    var lastErr error
    
    for attempt := 0; attempt <= config.MaxRetries; attempt++ {
        // Execute with rate limiting
        var resp *Response
        err := m.rateLimiter.Execute(ctx, func() error {
            var err error
            resp, err = m.provider.Generate(req)
            return err
        })
        
        if err == nil {
            return resp, nil
        }
        
        lastErr = err
        
        // Check if error is retryable
        if !isRetryable(err) {
            return nil, err
        }
        
        // Calculate backoff with jitter
        delay := time.Duration(math.Pow(2, float64(attempt))) * config.BaseDelay
        if delay > config.MaxDelay {
            delay = config.MaxDelay
        }
        
        // Add jitter (±25%)
        jitter := time.Duration(rand.Float64()*0.5-0.25) * delay
        delay += jitter
        
        log.Warnf("Retry attempt %d after %v: %v", attempt+1, delay, err)
        
        select {
        case <-time.After(delay):
            continue
        case <-ctx.Done():
            return nil, ctx.Err()
        }
    }
    
    return nil, fmt.Errorf("max retries exceeded: %w", lastErr)
}

func isRetryable(err error) bool {
    // Retry on rate limits and transient errors
    if strings.Contains(err.Error(), "429") {
        return true
    }
    if strings.Contains(err.Error(), "503") {
        return true
    }
    if strings.Contains(err.Error(), "timeout") {
        return true
    }
    return false
}

// Multi-provider fallback
type MultiProviderClient struct {
    providers []Provider
    selector  *ProviderSelector
}

func (mpc *MultiProviderClient) Generate(ctx context.Context, req *Request) (*Response, error) {
    // Try primary provider
    primary := mpc.providers[0]
    resp, err := primary.Generate(ctx, req)
    if err == nil {
        return resp, nil
    }
    
    // If rate limited, try fallback providers
    if strings.Contains(err.Error(), "429") {
        for _, fallback := range mpc.providers[1:] {
            log.Infof("Falling back to provider: %s", fallback.Name())
            resp, err := fallback.Generate(ctx, req)
            if err == nil {
                metrics.RecordProviderFallback(primary.Name(), fallback.Name())
                return resp, nil
            }
        }
    }
    
    return nil, err
}
```

**Prevention**:
- Implement provider-level rate limiting
- Use exponential backoff with jitter
- Configure multiple provider accounts
- Implement provider fallback chains
- Monitor provider quota usage
- Request quota increases proactively

---

### 14.7 Issue 7: Semantic Cache False Positives

**Problem**: Semantic cache returns incorrect responses for similar but different prompts.

**Symptoms**:
- Users report incorrect responses
- Complaints about "stale" or "wrong" answers
- Cache hit ratio high but accuracy low
- Increased support tickets

**Root Cause**:
```go
// BAD: Similarity threshold too low
if similarity > 0.7 {  // Too permissive
    return cachedResponse
}
```

**Solution**:
```go
// GOOD: Adaptive similarity threshold with validation
type SemanticCacheConfig struct {
    BaseThreshold    float64
    MinThreshold     float64
    MaxThreshold     float64
    ValidationSample float64  // % of responses to validate
}

func (sc *SemanticCache) GetWithValidation(ctx context.Context, req *Request) (*Response, bool) {
    embedding := sc.embedder.Embed(req.Prompt)
    
    results := sc.vectorDB.Search(ctx, embedding, 1)
    if len(results) == 0 {
        return nil, false
    }
    
    match := results[0]
    
    // Dynamic threshold based on prompt characteristics
    threshold := sc.calculateThreshold(req)
    
    if match.Similarity < threshold {
        return nil, false
    }
    
    // Probabilistic validation
    if rand.Float64() < sc.config.ValidationSample {
        go sc.validateCacheHit(ctx, req, match)
    }
    
    return match.Response, true
}

func (sc *SemanticCache) calculateThreshold(req *Request) float64 {
    base := sc.config.BaseThreshold
    
    // Increase threshold for:
    // 1. Short prompts (more ambiguous)
    if len(req.Prompt) < 50 {
        base += 0.05
    }
    
    // 2. Questions (require exact match)
    if strings.Contains(req.Prompt, "?") {
        base += 0.03
    }
    
    // 3. Code generation (precision critical)
    if req.TaskType == "code" {
        base += 0.05
    }
    
    // 4. High-priority requests
    if req.Priority == PriorityHigh {
        base += 0.02
    }
    
    // Clamp to min/max
    if base < sc.config.MinThreshold {
        base = sc.config.MinThreshold
    }
    if base > sc.config.MaxThreshold {
        base = sc.config.MaxThreshold
    }
    
    return base
}

// Validate cache hits asynchronously
func (sc *SemanticCache) validateCacheHit(ctx context.Context, req *Request, match *CacheMatch) {
    // Generate fresh response
    freshResp, err := sc.llm.Generate(ctx, req)
    if err != nil {
        return
    }
    
    // Compare responses
    similarity := sc.compareResponses(match.Response, freshResp)
    
    // Record validation result
    metrics.RecordCacheValidation(match.Similarity, similarity, similarity > 0.9)
    
    // Alert if cache is returning bad results
    if similarity < 0.8 {
        alerts.Send(AlertSemanticCacheFalsePositive, map[string]interface{}{
            "prompt_similarity": match.Similarity,
            "response_similarity": similarity,
            "threshold": sc.calculateThreshold(req),
        })
        
        // Optionally invalidate cache entry
        sc.vectorDB.Delete(ctx, match.ID)
    }
}

// Add metadata-based filtering
type CacheEntry struct {
    Embedding  []float64
    Response   *Response
    Metadata   map[string]string
}

func (sc *SemanticCache) SearchWithMetadata(ctx context.Context, req *Request) (*Response, bool) {
    embedding := sc.embedder.Embed(req.Prompt)
    
    // Search with metadata filters
    filters := map[string]string{
        "model":     req.ModelHint,
        "task_type": req.TaskType,
        "language":  detectLanguage(req.Prompt),
    }
    
    results := sc.vectorDB.SearchWithFilters(ctx, embedding, filters, 1)
    if len(results) == 0 {
        return nil, false
    }
    
    match := results[0]
    threshold := sc.calculateThreshold(req)
    
    if match.Similarity >= threshold {
        return match.Response, true
    }
    
    return nil, false
}
```

**Prevention**:
- Use adaptive similarity thresholds
- Implement validation sampling
- Add metadata-based filtering
- Monitor false positive rates
- Allow users to report incorrect responses
- Implement cache invalidation mechanisms

---

### 14.8 Issue 8: Quota Gaming / Abuse

**Problem**: Teams find ways to game the quota system or abuse shared resources.

**Symptoms**:
- Unusual traffic patterns
- Quota exhaustion at odd times
- Multiple API keys from same team
- Suspicious request patterns

**Common Gaming Techniques**:
1. Creating multiple team accounts
2. Rotating API keys to reset quotas
3. Splitting requests across time windows
4. Using low-priority requests to bypass limits

**Solution**:
```go
// Implement abuse detection
type AbuseDetector struct {
    patterns map[string]*PatternDetector
    ml       *MLAnomalyDetector
}

func (ad *AbuseDetector) DetectAbuse(ctx context.Context, req *Request) (bool, string) {
    // 1. Check for multiple accounts from same source
    if ad.detectMultipleAccounts(req) {
        return true, "multiple_accounts_same_source"
    }
    
    // 2. Check for unusual request patterns
    if ad.detectUnusualPattern(req) {
        return true, "unusual_request_pattern"
    }
    
    // 3. Check for quota manipulation
    if ad.detectQuotaManipulation(req) {
        return true, "quota_manipulation"
    }
    
    // 4. ML-based anomaly detection
    if ad.ml.IsAnomalous(req) {
        return true, "ml_anomaly_detected"
    }
    
    return false, ""
}

func (ad *AbuseDetector) detectMultipleAccounts(req *Request) bool {
    // Track IP addresses, user agents, request patterns
    fingerprint := generateFingerprint(req)
    
    teams := ad.getTeamsWithFingerprint(fingerprint)
    if len(teams) > 3 {
        // Same fingerprint used by multiple teams
        log.Warnf("Potential abuse: fingerprint %s used by %d teams", fingerprint, len(teams))
        return true
    }
    
    return false
}

func (ad *AbuseDetector) detectQuotaManipulation(req *Request) bool {
    teamID := req.TeamID
    
    // Check for rapid API key rotation
    apiKeys := ad.getRecentAPIKeys(teamID, 24*time.Hour)
    if len(apiKeys) > 5 {
        return true
    }
    
    // Check for request timing manipulation
    // (e.g., all requests just after quota reset)
    distribution := ad.getRequestDistribution(teamID, 24*time.Hour)
    if distribution.IsHighlySkewed() {
        return true
    }
    
    return false
}

// Implement rate limiting across related entities
type CrossEntityRateLimiter struct {
    redis *redis.Client
}

func (cerl *CrossEntityRateLimiter) CheckLimit(ctx context.Context, req *Request) (bool, error) {
    // Check limits across multiple dimensions
    checks := []struct {
        key   string
        limit int
    }{
        {fmt.Sprintf("team:%s", req.TeamID), 10000},
        {fmt.Sprintf("ip:%s", req.IPAddress), 1000},
        {fmt.Sprintf("user:%s", req.UserID), 500},
        {fmt.Sprintf("fingerprint:%s", req.Fingerprint), 2000},
    }
    
    for _, check := range checks {
        count, err := cerl.redis.Incr(ctx, check.key).Result()
        if err != nil {
            return false, err
        }
        
        if count > int64(check.limit) {
            log.Warnf("Rate limit exceeded for %s: %d > %d", check.key, count, check.limit)
            return false, nil
        }
        
        // Set expiry if first request
        if count == 1 {
            cerl.redis.Expire(ctx, check.key, 1*time.Minute)
        }
    }
    
    return true, nil
}

// Implement cost-based quotas instead of token-based
type CostBasedQuota struct {
    monthlyBudget float64
    currentSpend  float64
}

func (cbq *CostBasedQuota) CanProceed(estimatedCost float64) bool {
    if cbq.currentSpend+estimatedCost > cbq.monthlyBudget {
        return false
    }
    return true
}

// This prevents gaming by:
// 1. Making it harder to predict quota limits
// 2. Accounting for actual resource usage
// 3. Preventing cheap model abuse
```

**Prevention**:
- Implement fingerprinting and cross-entity tracking
- Use ML-based anomaly detection
- Monitor for unusual patterns
- Implement cost-based quotas
- Add manual review for suspicious accounts
- Rate limit by IP, user, and team
- Implement CAPTCHA for suspicious traffic

---

### 14.9 Issue 9: Cold Start Latency

**Problem**: First request after deployment or scaling has high latency due to cold starts.

**Symptoms**:
- P99 latency spikes after deployments
- First requests to new pods are slow
- Cache misses on startup
- Model loading delays

**Solution**:
```go
// Implement readiness probes with warm-up
func (g *LLMGateway) ReadinessCheck(w http.ResponseWriter, r *http.Request) {
    if !g.isWarmedUp {
        http.Error(w, "Service warming up", http.StatusServiceUnavailable)
        return
    }
    
    w.WriteHeader(http.StatusOK)
}

func (g *LLMGateway) WarmUp(ctx context.Context) error {
    log.Info("Starting warm-up sequence...")
    
    // 1. Pre-load cache with common queries
    if err := g.cacheManager.WarmCache(ctx); err != nil {
        log.Errorf("Cache warm-up failed: %v", err)
    }
    
    // 2. Pre-establish database connections
    if err := g.db.Ping(); err != nil {
        return fmt.Errorf("database ping failed: %w", err)
    }
    
    // 3. Pre-establish Redis connections
    if err := g.redis.Ping(ctx).Err(); err != nil {
        return fmt.Errorf("redis ping failed: %w", err)
    }
    
    // 4. Pre-load model metadata
    if err := g.modelRouter.LoadModels(ctx); err != nil {
        return fmt.Errorf("model loading failed: %w", err)
    }
    
    // 5. Execute test requests to warm up connections
    testReq := &InferenceRequest{
        RequestID: "warmup",
        TeamID:    "system",
        Prompt:    "test",
        MaxTokens: 10,
    }
    
    if _, err := g.ProcessRequest(ctx, testReq); err != nil {
        log.Warnf("Warm-up test request failed: %v", err)
    }
    
    g.isWarmedUp = true
    log.Info("Warm-up sequence completed")
    return nil
}
```

**Prevention**:
- Implement comprehensive warm-up sequences
- Use readiness probes correctly
- Pre-load caches and connections
- Gradual traffic ramp-up after deployment
- Keep minimum number of pods always running

---

### 14.10 Production Issue Summary

| Issue | Impact | Detection Time | Fix Complexity | Prevention Cost |
|-------|--------|----------------|----------------|-----------------|
| **Rate Limit Thundering Herd** | High | Minutes | Medium | Low |
| **Cache Stampede** | High | Seconds | Medium | Medium |
| **Token Estimation Inaccuracy** | Medium | Hours | Low | Low |
| **DB Connection Pool Exhaustion** | Critical | Minutes | Low | Low |
| **Redis Memory Exhaustion** | Critical | Hours | Medium | Low |
| **Provider Rate Limits** | Critical | Seconds | Medium | Medium |
| **Semantic Cache False Positives** | Medium | Days | High | High |
| **Quota Gaming/Abuse** | Medium | Days | High | Medium |
| **Cold Start Latency** | Low | Seconds | Low | Low |

### 14.11 Key Takeaways

1. **Monitoring is Critical**: Most issues can be detected early with proper monitoring
2. **Defense in Depth**: Multiple layers of protection prevent cascading failures
3. **Graceful Degradation**: Systems should degrade gracefully under stress
4. **Feedback Loops**: Implement continuous learning from production data
5. **Testing**: Load testing and chaos engineering catch issues before production

### 14.12 Recommended Monitoring Alerts

```yaml
# Critical Alerts (Page immediately)
- name: HighErrorRate
  condition: error_rate > 5%
  duration: 5m
  
- name: DatabasePoolExhaustion
  condition: db_pool_utilization > 90%
  duration: 2m
  
- name: RedisMemoryHigh
  condition: redis_memory_utilization > 85%
  duration: 5m
  
- name: ProviderRateLimitHit
  condition: provider_429_errors > 10
  duration: 1m

# Warning Alerts (Investigate during business hours)
- name: CacheHitRateLow
  condition: cache_hit_ratio < 50%
  duration: 15m
  
- name: QuotaApproaching
  condition: quota_utilization > 80%
  duration: 1h
  
- name: TokenEstimationDrift
  condition: abs(estimated - actual) / actual > 20%
  duration: 30m
  
- name: UnusualTrafficPattern
  condition: ml_anomaly_score > 0.8
  duration: 10m
```
