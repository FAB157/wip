$files = @(
    "src/components/MapArea.tsx",
    "src/components/PlanScreen.tsx",
    "src/components/PoiDetailSheet.tsx",
    "src/components/BottomNav.tsx",
    "src/components/PoiCard.tsx",
    "src/components/CategoryChips.tsx",
    "src/components/EventsScreen.tsx",
    "src/components/PremiumGuideModal.tsx",
    "src/components/PremiumGuideRenderer.tsx",
    "src/components/PoiPopupContent.tsx",
    "src/components/PlanMap.tsx"
)

foreach ($file in $files) {
    if (Test-Path $file) {
        $content = Get-Content -Path $file -Raw
        
        $content = $content -replace 'text-on-surface-variant/(\d+)', 'text-[#1e3a8a]/$1'
        $content = $content -replace 'text-on-surface-variant\b', 'text-[#1e3a8a]'
        $content = $content -replace 'text-on-surface\b', 'text-[#1e3a8a]'
        
        $content = $content -replace 'text-gray-400\b', 'text-[#1e3a8a]/50'
        $content = $content -replace 'text-gray-500\b', 'text-[#1e3a8a]/60'
        $content = $content -replace 'text-gray-600\b', 'text-[#1e3a8a]/70'
        $content = $content -replace 'text-gray-700\b', 'text-[#1e3a8a]/80'
        $content = $content -replace 'text-gray-800\b', 'text-[#1e3a8a]'
        $content = $content -replace 'text-gray-900\b', 'text-[#1e3a8a]'
        
        $content = $content -replace 'bg-background\b', 'bg-[#fdfbf7]'
        $content = $content -replace 'bg-surface\b', 'bg-[#fcfaf8]'
        $content = $content -replace 'bg-surface-variant\b', 'bg-[#f8f5f0]'
        
        $content = $content -replace 'bg-gray-50\b', 'bg-[#fcfaf8]'
        $content = $content -replace 'bg-gray-100\b', 'bg-[#fdfbf7]'
        $content = $content -replace 'bg-gray-200\b', 'bg-amber-50'
        
        $content = $content -replace 'border-gray-100\b', 'border-amber-100/50'
        $content = $content -replace 'border-gray-200\b', 'border-amber-100/60'
        $content = $content -replace 'border-gray-300\b', 'border-amber-200/50'
        
        $content = $content -replace 'border-outline-variant/10\b', 'border-amber-100/50'
        $content = $content -replace 'border-outline-variant/20\b', 'border-amber-100/60'
        $content = $content -replace 'border-outline-variant/30\b', 'border-amber-200/50'
        $content = $content -replace 'border-outline-variant/5\b', 'border-amber-100/40'
        $content = $content -replace 'border-outline/10\b', 'border-amber-100/50'
        
        # Specific fixes for text-muted etc if any
        $content = $content -replace 'text-muted\b', 'text-[#1e3a8a]/60'

        Set-Content -Path $file -Value $content -NoNewline
        Write-Host "Updated: $file"
    }
}
Write-Host "Color update complete."
