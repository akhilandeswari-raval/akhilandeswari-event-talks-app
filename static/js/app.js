document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const btnRefresh = document.getElementById('btn-refresh');
    const spinnerIcon = document.getElementById('spinner-icon');
    const statusDot = document.getElementById('status-dot');
    const statusText = document.getElementById('status-text');
    const searchInput = document.getElementById('search-input');
    const filterTags = document.getElementById('filter-tags');
    const skeletonGrid = document.getElementById('skeleton-grid');
    const notesGrid = document.getElementById('notes-grid');
    const errorPanel = document.getElementById('error-panel');
    const errorMessage = document.getElementById('error-message');
    const btnRetry = document.getElementById('btn-retry');
    const noResultsPanel = document.getElementById('no-results-panel');
    
    // Modal Elements
    const composerModal = document.getElementById('composer-modal');
    const btnCloseModal = document.getElementById('btn-close-modal');
    const modalSourceDate = document.getElementById('modal-source-date');
    const modalSourceType = document.getElementById('modal-source-type');
    const tweetTextarea = document.getElementById('tweet-textarea');
    const progressCircle = document.getElementById('progress-ring-circle');
    const charCountText = document.getElementById('char-count-text');
    const btnCopyTweet = document.getElementById('btn-copy-tweet');
    const btnPostTweet = document.getElementById('btn-post-tweet');
    
    // State Variables
    let allReleaseNotes = [];
    let activeFilter = 'all';
    let searchQuery = '';
    
    // SVG Progress Circle Math
    const circleRadius = 10;
    const circleCircumference = 2 * Math.PI * circleRadius;
    if (progressCircle) {
        progressCircle.style.strokeDasharray = `${circleCircumference} ${circleCircumference}`;
        progressCircle.style.strokeDashoffset = circleCircumference;
    }

    // Initialize
    fetchReleaseNotes();

    // Event Listeners
    btnRefresh.addEventListener('click', fetchReleaseNotes);
    btnRetry.addEventListener('click', fetchReleaseNotes);
    
    searchInput.addEventListener('input', (e) => {
        searchQuery = e.target.value.toLowerCase().trim();
        applyFiltersAndSearch();
    });

    filterTags.addEventListener('click', (e) => {
        const tag = e.target.closest('.tag');
        if (!tag) return;
        
        // Update active class
        filterTags.querySelectorAll('.tag').forEach(t => t.classList.remove('active'));
        tag.classList.add('active');
        
        activeFilter = tag.dataset.type;
        applyFiltersAndSearch();
    });

    // Close Modal Events
    btnCloseModal.addEventListener('click', hideModal);
    composerModal.addEventListener('click', (e) => {
        if (e.target === composerModal) hideModal();
    });
    
    // Modal Actions
    tweetTextarea.addEventListener('input', updateCharCounter);
    
    btnCopyTweet.addEventListener('click', () => {
        const text = tweetTextarea.value;
        navigator.clipboard.writeText(text).then(() => {
            showToast('📋 Tweet copied to clipboard!');
        }).catch(err => {
            console.error('Could not copy text: ', err);
            showToast('❌ Failed to copy to clipboard.');
        });
    });

    btnPostTweet.addEventListener('click', () => {
        const text = tweetTextarea.value;
        const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
        window.open(twitterUrl, '_blank', 'noopener,noreferrer');
        hideModal();
        showToast('🚀 X (Twitter) composer opened!');
    });

    // Fetch API
    function fetchReleaseNotes() {
        // Toggle Loading UI
        setLoadingState(true);
        
        fetch('/api/notes')
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP error! Status: ${response.status}`);
                }
                return response.json();
            })
            .then(data => {
                if (data.status === 'success') {
                    allReleaseNotes = processRawNotes(data.notes);
                    renderNotes(allReleaseNotes);
                    
                    // Update Status
                    const now = new Date();
                    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                    statusDot.className = 'status-dot pulsing';
                    statusText.textContent = `Synced at ${timeStr}`;
                    
                    setErrorState(false);
                } else {
                    throw new Error(data.message || 'Unknown backend error');
                }
            })
            .catch(error => {
                console.error('Error fetching release notes:', error);
                statusDot.className = 'status-dot error';
                statusText.textContent = 'Sync Failed';
                errorMessage.textContent = error.message || 'Could not reach server or retrieve feed data.';
                setErrorState(true);
            })
            .finally(() => {
                setLoadingState(false);
            });
    }

    // Process raw feed notes into individual update blocks
    function processRawNotes(rawNotes) {
        const processed = [];
        
        rawNotes.forEach(note => {
            const dateStr = note.title; // e.g. "June 17, 2026"
            const link = note.link;
            
            // Parse HTML content to extract individual updates
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = note.content;
            
            const blocks = [];
            let currentType = 'feature'; // Default type
            let currentContent = '';
            
            // Traverse child elements
            Array.from(tempDiv.children).forEach(el => {
                const tagName = el.tagName.toLowerCase();
                
                // If it's a heading (like H3), we start a new update block type
                if (tagName === 'h3' || tagName === 'h4') {
                    // Save previous block if it exists
                    if (currentContent.trim()) {
                        blocks.push({
                            type: currentType,
                            html: currentContent.trim(),
                            text: cleanHtmlToText(currentContent)
                        });
                        currentContent = '';
                    }
                    
                    const headerText = el.textContent.toLowerCase();
                    if (headerText.includes('feature')) {
                        currentType = 'feature';
                    } else if (headerText.includes('change') || headerText.includes('update')) {
                        currentType = 'changed';
                    } else if (headerText.includes('deprecat')) {
                        currentType = 'deprecated';
                    } else if (headerText.includes('fix')) {
                        currentType = 'fixed';
                    } else {
                        currentType = 'feature'; // fallback
                    }
                } else {
                    // Append outerHTML to current content block
                    currentContent += el.outerHTML;
                }
            });
            
            // Add final block
            if (currentContent.trim()) {
                blocks.push({
                    type: currentType,
                    html: currentContent.trim(),
                    text: cleanHtmlToText(currentContent)
                });
            }
            
            // Fallback: If no blocks parsed, use whole content as a single feature block
            if (blocks.length === 0 && note.content.trim()) {
                blocks.push({
                    type: 'feature',
                    html: note.content,
                    text: cleanHtmlToText(note.content)
                });
            }
            
            if (blocks.length > 0) {
                processed.push({
                    id: note.id,
                    date: dateStr,
                    link: link,
                    blocks: blocks
                });
            }
        });
        
        return processed;
    }

    // Helper to strip HTML and get clean text
    function cleanHtmlToText(html) {
        const temp = document.createElement('div');
        temp.innerHTML = html;
        // Clean up spacings
        return temp.textContent || temp.innerText || "";
    }

    // Render Cards in DOM
    function renderNotes(notes) {
        notesGrid.innerHTML = '';
        
        if (notes.length === 0) {
            noResultsPanel.classList.remove('hidden');
            return;
        } else {
            noResultsPanel.classList.add('hidden');
        }
        
        notes.forEach((card, index) => {
            const cardEl = document.createElement('article');
            cardEl.className = 'release-card';
            cardEl.style.animationDelay = `${index * 0.05}s`;
            cardEl.setAttribute('data-id', card.id);
            
            let blocksHtml = '';
            card.blocks.forEach((block, bIndex) => {
                blocksHtml += `
                    <div class="update-block type-${block.type}" data-type="${block.type}">
                        <div class="block-actions">
                            <button class="btn-tweet-block" data-card-index="${index}" data-block-index="${bIndex}" aria-label="Tweet this update">
                                <svg viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                                </svg>
                                <span>Tweet</span>
                            </button>
                        </div>
                        <span class="badge badge-${block.type}">${block.type}</span>
                        <div class="update-desc">${block.html}</div>
                    </div>
                `;
            });
            
            cardEl.innerHTML = `
                <div class="card-header">
                    <div class="card-date-wrapper">
                        <div class="card-date-icon" aria-hidden="true">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                                <line x1="16" y1="2" x2="16" y2="6"></line>
                                <line x1="8" y1="2" x2="8" y2="6"></line>
                                <line x1="3" y1="10" x2="21" y2="10"></line>
                            </svg>
                        </div>
                        <h2 class="card-date">${card.date}</h2>
                    </div>
                    <a href="${card.link || 'https://cloud.google.com/bigquery/docs/release-notes'}" target="_blank" class="btn-card-link" aria-label="Open source release notes for ${card.date}" rel="noopener noreferrer">
                        <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                            <polyline points="15 3 21 3 21 9"></polyline>
                            <line x1="10" y1="14" x2="21" y2="3"></line>
                        </svg>
                    </a>
                </div>
                <div class="card-body">
                    ${blocksHtml}
                </div>
            `;
            
            notesGrid.appendChild(cardEl);
        });

        // Attach event listeners to newly rendered Tweet buttons
        document.querySelectorAll('.btn-tweet-block').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const btnTarget = e.currentTarget;
                const cardIndex = parseInt(btnTarget.dataset.cardIndex, 10);
                const blockIndex = parseInt(btnTarget.dataset.blockIndex, 10);
                openTweetComposer(cardIndex, blockIndex);
            });
        });
    }

    // Filtering and Searching logic
    function applyFiltersAndSearch() {
        const filteredNotes = [];
        
        allReleaseNotes.forEach(card => {
            const matchingBlocks = card.blocks.filter(block => {
                const matchesType = (activeFilter === 'all' || block.type === activeFilter);
                const matchesSearch = (!searchQuery || 
                    block.text.toLowerCase().includes(searchQuery) || 
                    card.date.toLowerCase().includes(searchQuery) ||
                    block.type.toLowerCase().includes(searchQuery));
                return matchesType && matchesSearch;
            });
            
            if (matchingBlocks.length > 0) {
                // Return a copy of the card with only the matching blocks
                filteredNotes.push({
                    ...card,
                    blocks: matchingBlocks
                });
            }
        });
        
        renderNotes(filteredNotes);
    }

    // Set UI Loading State
    function setLoadingState(isLoading) {
        if (isLoading) {
            spinnerIcon.classList.add('spinning');
            btnRefresh.disabled = true;
            skeletonGrid.classList.remove('hidden');
            notesGrid.classList.add('hidden');
            errorPanel.classList.add('hidden');
            noResultsPanel.classList.add('hidden');
        } else {
            spinnerIcon.classList.remove('spinning');
            btnRefresh.disabled = false;
            skeletonGrid.classList.add('hidden');
            notesGrid.classList.remove('hidden');
        }
    }

    // Toggle Error State
    function setErrorState(isError) {
        if (isError) {
            errorPanel.classList.remove('hidden');
            notesGrid.classList.add('hidden');
            skeletonGrid.classList.add('hidden');
        } else {
            errorPanel.classList.add('hidden');
        }
    }

    // Open Tweet Composer Modal
    function openTweetComposer(cardIndex, blockIndex) {
        const card = allReleaseNotes[cardIndex];
        const block = card.blocks[blockIndex];
        
        modalSourceDate.textContent = card.date;
        modalSourceType.textContent = block.type;
        
        // Reset type badge colors
        modalSourceType.className = `source-tag type-badge badge-${block.type}`;
        
        // Construct Initial Tweet text
        // Clean text - trim double spaces and truncate cleanly to fit template limit
        let cleanText = block.text.replace(/\s+/g, ' ').trim();
        
        // Build base elements of tweet to calculate available space
        const prefix = `BigQuery ${block.type.toUpperCase()} (${card.date}): `;
        const linkStr = `\nRelease Details: ${card.link || 'https://cloud.google.com/bigquery/docs/release-notes'}`;
        const hashtags = `\n#BigQuery #GCP`;
        
        const templateLength = prefix.length + linkStr.length + hashtags.length;
        const maxContentLength = 280 - templateLength;
        
        if (cleanText.length > maxContentLength) {
            cleanText = cleanText.substring(0, maxContentLength - 3) + '...';
        }
        
        const initialTweetText = `${prefix}${cleanText}${linkStr}${hashtags}`;
        
        tweetTextarea.value = initialTweetText;
        
        composerModal.classList.remove('hidden');
        document.body.style.overflow = 'hidden'; // Lock background scrolling
        
        updateCharCounter();
        tweetTextarea.focus();
    }

    function hideModal() {
        composerModal.classList.add('hidden');
        document.body.style.overflow = ''; // Unlock background scrolling
    }

    // Update circular progress and char counter in composer
    function updateCharCounter() {
        const text = tweetTextarea.value;
        const currentLength = text.length;
        const remaining = 280 - currentLength;
        
        charCountText.textContent = remaining;
        
        // Progress percentage
        const progressPercentage = Math.min(currentLength / 280, 1);
        const offset = circleCircumference - (progressPercentage * circleCircumference);
        
        if (progressCircle) {
            progressCircle.style.strokeDashoffset = offset;
            
            // Update colors based on limit
            if (remaining <= 0) {
                progressCircle.style.stroke = 'var(--color-fixed)';
                charCountText.style.color = 'var(--color-fixed)';
                btnPostTweet.disabled = true;
            } else if (remaining <= 20) {
                progressCircle.style.stroke = 'var(--color-deprecated)';
                charCountText.style.color = 'var(--color-deprecated)';
                btnPostTweet.disabled = false;
            } else {
                progressCircle.style.stroke = 'var(--accent-primary)';
                charCountText.style.color = 'var(--text-secondary)';
                btnPostTweet.disabled = false;
            }
        }
    }

    // Toast Notification System
    function showToast(message) {
        let toastContainer = document.getElementById('toast-container');
        if (!toastContainer) {
            toastContainer = document.createElement('div');
            toastContainer.id = 'toast-container';
            toastContainer.className = 'toast-container';
            document.body.appendChild(toastContainer);
        }
        
        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.textContent = message;
        
        toastContainer.appendChild(toast);
        
        // Remove after 3 seconds
        setTimeout(() => {
            toast.style.animation = 'toastSlideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) reverse forwards';
            setTimeout(() => {
                toast.remove();
            }, 300);
        }, 3000);
    }
});
