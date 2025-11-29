# Test API Endpoints Script
# Tests all available API endpoints to ensure they work correctly

$baseUrl = "http://localhost:3001"
$testResults = @()

function Test-Endpoint {
    param(
        [string]$Method,
        [string]$Path,
        [hashtable]$Body = $null,
        [string]$Description
    )
    
    Write-Host "`n🧪 Testing: $Description" -ForegroundColor Cyan
    Write-Host "   $Method $Path" -ForegroundColor Gray
    
    try {
        $params = @{
            Uri = "$baseUrl$Path"
            Method = $Method
            ContentType = "application/json"
            UseBasicParsing = $true
        }
        
        if ($Body) {
            $params.Body = ($Body | ConvertTo-Json -Depth 10)
        }
        
        $response = Invoke-WebRequest @params -ErrorAction Stop
        
        $result = @{
            Description = $Description
            Method = $Method
            Path = $Path
            StatusCode = $response.StatusCode
            Success = $true
            Response = ($response.Content | ConvertFrom-Json)
            Headers = $response.Headers
        }
        
        Write-Host "   ✅ Status: $($response.StatusCode)" -ForegroundColor Green
        
        # Check CORS headers
        if ($response.Headers['Access-Control-Allow-Origin']) {
            Write-Host "   ✅ CORS: Enabled" -ForegroundColor Green
        }
        
        return $result
    }
    catch {
        $statusCode = $_.Exception.Response.StatusCode.value__
        $result = @{
            Description = $Description
            Method = $Method
            Path = $Path
            StatusCode = $statusCode
            Success = $false
            Error = $_.Exception.Message
        }
        
        if ($statusCode -eq 503) {
            Write-Host "   ⚠️  Status: $statusCode (Service unavailable - Cosmos DB not configured)" -ForegroundColor Yellow
        }
        elseif ($statusCode -eq 404) {
            Write-Host "   ⚠️  Status: $statusCode (Not found - expected for some endpoints)" -ForegroundColor Yellow
        }
        else {
            Write-Host "   ❌ Status: $statusCode" -ForegroundColor Red
            Write-Host "   Error: $($_.Exception.Message)" -ForegroundColor Red
        }
        
        return $result
    }
}

Write-Host "`n═══════════════════════════════════════════════════════════" -ForegroundColor Magenta
Write-Host "  Plateful API Endpoint Testing" -ForegroundColor Magenta
Write-Host "═══════════════════════════════════════════════════════════`n" -ForegroundColor Magenta

# 1. Health Check
$testResults += Test-Endpoint -Method "GET" -Path "/health" -Description "Health Check"

# 2. Service Health Checks (no DB required)
$testResults += Test-Endpoint -Method "GET" -Path "/api/profile" -Description "Profile Service Health"
$testResults += Test-Endpoint -Method "GET" -Path "/api/pantry" -Description "Pantry Service Health"
$testResults += Test-Endpoint -Method "GET" -Path "/api/grocery" -Description "Grocery Service Health"

# 3. Mock Chat Endpoints (no DB required)
$testResults += Test-Endpoint -Method "POST" -Path "/api/chat/conversation" -Body @{
    userID = "test-user-123"
} -Description "Create Chat Conversation (Mock)"

# Get the conversation ID from the response
$convResult = $testResults | Where-Object { $_.Description -eq "Create Chat Conversation (Mock)" }
if ($convResult.Success -and $convResult.Response.conversation) {
    $conversationID = $convResult.Response.conversation.conversationID
    
    $testResults += Test-Endpoint -Method "GET" -Path "/api/chat/conversation/$conversationID" -Description "Get Chat Conversation"
    
    $testResults += Test-Endpoint -Method "POST" -Path "/api/chat/message" -Body @{
        conversationID = $conversationID
        role = "user"
        content = "I want to make pasta"
    } -Description "Add Chat Message"
    
    $testResults += Test-Endpoint -Method "GET" -Path "/api/chat/messages/$conversationID" -Description "Get Chat Messages"
    
    $testResults += Test-Endpoint -Method "GET" -Path "/api/chat/conversations/user/test-user-123" -Description "Get User Conversations"
}

# 4. Profile Endpoints (requires Cosmos DB - will return 503)
$testResults += Test-Endpoint -Method "GET" -Path "/api/profile/test-user-123" -Description "Get User Profile (requires Cosmos DB)"
$testResults += Test-Endpoint -Method "PUT" -Path "/api/profile/test-user-123" -Body @{
    displayName = "Test User"
    likes = @("pasta", "pizza")
    allergens = @("peanuts")
} -Description "Update User Profile (requires Cosmos DB)"

# 5. Pantry Endpoints (requires Cosmos DB - will return 503)
$testResults += Test-Endpoint -Method "GET" -Path "/api/pantry/test-user-123" -Description "Get Pantry Items (requires Cosmos DB)"
$testResults += Test-Endpoint -Method "POST" -Path "/api/pantry/test-user-123" -Body @{
    items = @(
        @{
            name = "Tomatoes"
            category = "Vegetables"
            quantity = 5
            unit = "pieces"
        }
    )
} -Description "Add Pantry Items (requires Cosmos DB)"

# 6. Grocery Endpoints (requires Cosmos DB - will return 503)
$testResults += Test-Endpoint -Method "GET" -Path "/api/grocery/test-user-123/lists" -Description "Get Grocery Lists (requires Cosmos DB)"
$testResults += Test-Endpoint -Method "POST" -Path "/api/grocery/test-user-123/lists" -Body @{
    name = "Test Grocery List"
} -Description "Create Grocery List (requires Cosmos DB)"

# Summary
Write-Host "`n═══════════════════════════════════════════════════════════" -ForegroundColor Magenta
Write-Host "  Test Summary" -ForegroundColor Magenta
Write-Host "═══════════════════════════════════════════════════════════`n" -ForegroundColor Magenta

$successful = ($testResults | Where-Object { $_.Success }).Count
$failed = ($testResults | Where-Object { -not $_.Success }).Count
$total = $testResults.Count

Write-Host "Total Tests: $total" -ForegroundColor White
Write-Host "✅ Successful: $successful" -ForegroundColor Green
Write-Host "❌ Failed: $failed" -ForegroundColor $(if ($failed -gt 0) { "Red" } else { "Green" })

# Show which endpoints work without Cosmos DB
Write-Host "`n✅ Endpoints Working (No Cosmos DB Required):" -ForegroundColor Green
$testResults | Where-Object { $_.Success -and $_.StatusCode -eq 200 } | ForEach-Object {
    Write-Host "   • $($_.Description)" -ForegroundColor Gray
}

# Show which endpoints need Cosmos DB
$needsDB = $testResults | Where-Object { -not $_.Success -and $_.StatusCode -eq 503 }
if ($needsDB) {
    Write-Host "`n⚠️  Endpoints Requiring Cosmos DB:" -ForegroundColor Yellow
    $needsDB | ForEach-Object {
        Write-Host "   • $($_.Description)" -ForegroundColor Gray
    }
}

Write-Host "`n💡 Tip: Configure Cosmos DB to enable all endpoints" -ForegroundColor Cyan
Write-Host ""





