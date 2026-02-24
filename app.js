document.addEventListener('DOMContentLoaded', () => {
    
    // --- KONFIGURATION ---
    const DECKS_CONFIG = [
        { name: "Neurologie", file: "karten.json" }, 
        { name: "Neurologie", file: "neurologie_karten.json" }
    ];

    // --- DOM ELEMENTE ---
    const menuView = document.getElementById('menuView');
    const deckOverview = document.getElementById('deckOverview');
    const gameView = document.getElementById('gameView');
    
    const deckList = document.getElementById('deckList');
    
    // Overview Elements
    const backToMenuFromOverviewBtn = document.getElementById('backToMenuFromOverviewBtn');
    const overviewTitle = document.getElementById('overviewTitle');
    const statNew = document.getElementById('statNew');
    const statLearning = document.getElementById('statLearning');
    const statLater = document.getElementById('statLater');
    const statTime = document.getElementById('statTime'); 
    const statDone = document.getElementById('statDone');
    const overviewProgressBar = document.getElementById('overviewProgressBar');
    const progressText = document.getElementById('progressText');
    const startSessionBtn = document.getElementById('startSessionBtn');
    const startLaterSessionBtn = document.getElementById('startLaterSessionBtn');
    const resetDeckBtn = document.getElementById('resetDeckBtn');

    // Game Elements
    const backToOverviewBtn = document.getElementById('backToOverviewBtn');
    const currentCardEl = document.getElementById('currentCard');
    const nextCardEl = document.getElementById('nextCard');
    
    const questionText = document.getElementById('questionText');
    const answerSection = document.getElementById('answerSection');
    const answerText = document.getElementById('answerText');
    const infoSection = document.getElementById('infoSection');
    const infoText = document.getElementById('infoText');
    
    const cardCounter = document.getElementById('cardCounter');
    const gameProgressBar = document.getElementById('gameProgressBar');
    
    const blurBtn = document.getElementById('blurBtn');
    // HIER WURDEN DIE BUTTON-REFERENZEN ENTFERNT

    // --- STATE ---
    let fullDeck = []; 
    let sessionQueue = []; 
    let currentDeckName = "";
    let currentDeckFile = "";
    
    // Card State
    let currentCardData = null;
    let currentClozeGroupIndex = 0;
    let isInfoVisible = false;
    let cardFullySolved = false; 

    // Timer State
    let sessionInterval = null;
    let totalTimeSeconds = 0;

    // Swipe State
    let startX = 0; let startY = 0;
    let currentX = 0; let currentY = 0;
    let isDragging = false;
    let hasMoved = false; 

    // --- INIT ---
    initMenu();

    function initMenu() {
        deckList.innerHTML = '';
        DECKS_CONFIG.forEach(deck => {
            const btn = document.createElement('button');
            btn.className = 'deck-btn';
            btn.innerHTML = `<span>${deck.name}</span> <span class="deck-arrow">›</span>`;
            btn.addEventListener('click', () => loadDeckData(deck.name, deck.file));
            deckList.appendChild(btn);
        });
    }

    function loadDeckData(name, filename) {
        currentDeckName = name;
        currentDeckFile = filename;
        totalTimeSeconds = getDeckTime(currentDeckName);
        
        fetch(filename)
            .then(res => {
                if(!res.ok) throw new Error("Datei nicht gefunden");
                return res.json();
            })
            .then(data => {
                const savedStats = getDeckStats(currentDeckName);
                fullDeck = data.map((card, index) => {
                    const id = card.id || index;
                    const stat = savedStats[id] || { box: 0 };
                    return { ...card, id: id, box: stat.box };
                });
                showDeckOverview();
            })
            .catch(err => {
                console.error(err);
                alert(`Fehler: ${filename} nicht gefunden.`);
            });
    }

    function showDeckOverview() {
        stopTimer();
        menuView.classList.add('hidden');
        gameView.classList.add('hidden');
        deckOverview.classList.remove('hidden');

        overviewTitle.innerText = currentDeckName;

        const countNew = fullDeck.filter(c => c.box === 0).length;
        const countLearning = fullDeck.filter(c => typeof c.box === 'number' && c.box > 0 && c.box < 3).length;
        const countLater = fullDeck.filter(c => c.box === 'later').length;
        const countDone = fullDeck.filter(c => c.box === 3).length;

        statNew.innerText = countNew;
        statLearning.innerText = countLearning;
        statLater.innerText = countLater;
        statDone.innerText = countDone;
        statTime.innerText = formatTime(totalTimeSeconds);

        const total = fullDeck.length;
        const percent = total > 0 ? Math.round((countDone / total) * 100) : 0;
        overviewProgressBar.style.width = `${percent}%`;
        progressText.innerText = `${percent}% Gemeistert`;

        startLaterSessionBtn.classList.toggle('hidden', countLater === 0);
    }

    function startSession(mode = 'normal') {
        deckOverview.classList.add('hidden');
        gameView.classList.remove('hidden');

        sessionQueue = [];
        if (mode === 'later') sessionQueue = fullDeck.filter(c => c.box === 'later');
        else sessionQueue = fullDeck.filter(c => c.box !== 3 && c.box !== 'later');

        if(sessionQueue.length === 0) {
            if (mode === 'later') alert("Keine Karten im 'Später'-Stapel.");
            else alert("Alles erledigt!");
            showDeckOverview();
            return;
        }

        sessionQueue = shuffleArray(sessionQueue);
        startTimer();
        initCards();
    }

    // --- TIMER LOGIC ---
    function startTimer() {
        stopTimer(); 
        sessionInterval = setInterval(() => {
            totalTimeSeconds++;
            if (totalTimeSeconds % 10 === 0) saveDeckTime(currentDeckName, totalTimeSeconds);
        }, 1000);
    }

    function stopTimer() {
        if (sessionInterval) {
            clearInterval(sessionInterval);
            sessionInterval = null;
            saveDeckTime(currentDeckName, totalTimeSeconds);
        }
    }

    function formatTime(seconds) {
        if (seconds < 60) return "< 1m";
        const m = Math.floor(seconds / 60);
        if (m < 60) return `${m}m`;
        const h = Math.floor(m / 60);
        const remM = m % 60;
        return `${h}h ${remM}m`;
    }

    function getDeckTime(deckName) {
        const t = localStorage.getItem(`synapse_time_${deckName}`);
        return t ? parseInt(t, 10) : 0;
    }
    function saveDeckTime(deckName, time) { localStorage.setItem(`synapse_time_${deckName}`, time); }

    // --- CARD RENDER LOGIC ---
    function initCards() {
        resetCurrentCardStyles();
        nextCardEl.classList.remove('scaling-up');
        loadCardToDOM(sessionQueue[0]);
        if (sessionQueue.length > 1) renderBackgroundCard(sessionQueue[1]);
        else nextCardEl.innerHTML = "<div class='card-content'>Ende</div>";
        updateGameStats();
    }

    function advanceQueue() {
        if (sessionQueue.length === 0) {
            alert("Stapel leer!");
            showDeckOverview();
            return;
        }
        
        resetCurrentCardStyles(); 
        nextCardEl.classList.remove('scaling-up');

        loadCardToDOM(sessionQueue[0]);
        if (sessionQueue.length > 1) renderBackgroundCard(sessionQueue[1]);
        else nextCardEl.innerHTML = "<div class='card-content'>Ende</div>";
        updateGameStats();
    }

    function loadCardToDOM(card) {
        currentCardData = card;
        currentClozeGroupIndex = 0;
        isInfoVisible = false;
        cardFullySolved = false;

        answerSection.classList.add('hidden');
        infoSection.classList.add('hidden');
        
        currentCardEl.scrollTop = 0;
        questionText.innerHTML = card.frage; 
        answerText.innerHTML = card.antwort;
        infoText.innerHTML = card.zusatz_info || "";

        // HIER WURDE DIE INFO-BUTTON LOGIK ENTFERNT

        if (card.type === 'cloze') updateClozeVisuals(card);
    }

    function renderBackgroundCard(card) {
        nextCardEl.innerHTML = `<div class="card-content"><div>${card.frage}</div></div>`;
        const clozes = nextCardEl.querySelectorAll('.cloze-item');
        clozes.forEach(c => c.classList.remove('next-up', 'revealed')); 
    }

    function resetCurrentCardStyles() {
        currentCardEl.className = 'card card-foreground'; 
        currentCardEl.style.transform = '';
        currentCardEl.style.transition = 'none'; 
    }

    function updateGameStats() {
        cardCounter.innerText = `Noch: ${sessionQueue.length}`;
        const masteredCount = fullDeck.filter(c => c.box === 3).length;
        gameProgressBar.style.width = `${(masteredCount / fullDeck.length) * 100}%`;
    }

    // --- LOGIC ---
    function getDeckStats(deckName) {
        const stats = localStorage.getItem(`synapse_stats_${deckName}`);
        return stats ? JSON.parse(stats) : {};
    }
    function saveDeckStats(deckName, cardId, newBox) {
        const stats = getDeckStats(deckName);
        stats[cardId] = { box: newBox, lastReview: Date.now() };
        localStorage.setItem(`synapse_stats_${deckName}`, JSON.stringify(stats));
        const cardInDeck = fullDeck.find(c => c.id === cardId);
        if(cardInDeck) cardInDeck.box = newBox;
    }

    function handleCardResult(result) {
        if (!currentCardData) return;
        const processedCard = sessionQueue.shift();

        if (result === 'left') { 
            const newBox = 0;
            processedCard.box = newBox;
            saveDeckStats(currentDeckName, processedCard.id, newBox);
            const insertIndex = Math.min(sessionQueue.length, 3);
            sessionQueue.splice(insertIndex, 0, processedCard);
        } else if (result === 'right') { 
            let currentBox = (processedCard.box === 'later') ? 0 : processedCard.box;
            let newBox = currentBox + 1;
            processedCard.box = newBox;
            saveDeckStats(currentDeckName, processedCard.id, newBox);
            if (newBox < 3) sessionQueue.push(processedCard);
        } else if (result === 'up') { 
            processedCard.box = 'later';
            saveDeckStats(currentDeckName, processedCard.id, 'later');
        }

        nextCardEl.classList.add('scaling-up');
        setTimeout(() => advanceQueue(), 300); 
    }

    function resetDeck() {
        if(confirm("Willst du wirklich den gesamten Fortschritt löschen?")) {
            localStorage.removeItem(`synapse_stats_${currentDeckName}`);
            localStorage.removeItem(`synapse_time_${currentDeckName}`);
            loadDeckData(currentDeckName, currentDeckFile);
        }
    }

    // --- CLOZE ---
    function updateClozeVisuals(card) {
        if (currentClozeGroupIndex < card.cloze_order.length) {
            const nextIndex = card.cloze_order[currentClozeGroupIndex];
            const nextSpans = currentCardEl.querySelectorAll(`.cloze-item[data-index="${nextIndex}"]`);
            nextSpans.forEach(span => { if (!span.classList.contains('revealed')) span.classList.add('next-up'); });
        }
    }
    function revealSingleCloze() {
        const card = currentCardData;
        if (currentClozeGroupIndex < card.cloze_order.length) {
            const currentIndex = card.cloze_order[currentClozeGroupIndex];
            const pendingSpans = currentCardEl.querySelectorAll(`.cloze-item[data-index="${currentIndex}"]:not(.revealed)`);
            if (pendingSpans.length > 0) {
                const span = pendingSpans[0];
                span.innerHTML = span.getAttribute('data-solution');
                span.classList.remove('next-up');
                span.classList.add('revealed', 'just-revealed');
                if (pendingSpans.length === 1) { currentClozeGroupIndex++; updateClozeVisuals(card); }
            } else { currentClozeGroupIndex++; revealSingleCloze(); return; }
            if (currentClozeGroupIndex >= card.cloze_order.length) prepareForSwipe();
        } else { prepareForSwipe(); }
    }
    function revealAllContent() {
        const card = currentCardData;
        if (card.type === 'cloze') {
             if (currentClozeGroupIndex < card.cloze_order.length) {
                const currentIndex = card.cloze_order[currentClozeGroupIndex];
                const spans = currentCardEl.querySelectorAll(`.cloze-item[data-index="${currentIndex}"]`);
                spans.forEach(span => {
                    span.innerHTML = span.getAttribute('data-solution');
                    span.classList.remove('next-up');
                    span.classList.add('revealed', 'just-revealed');
                });
                currentClozeGroupIndex++;
                updateClozeVisuals(card);
             }
             if (currentClozeGroupIndex >= card.cloze_order.length) prepareForSwipe();
        } else { prepareForSwipe(); }
    }
    function prepareForSwipe() {
        if(cardFullySolved) return;
        cardFullySolved = true;
        answerSection.classList.remove('hidden');
        // HIER WURDE DIE EXTRA BTN LOGIK ENTFERNT
        setTimeout(() => answerSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 50);
    }

    // --- SWIPE LOGIK ---
    currentCardEl.addEventListener('touchstart', (e) => {
        if (e.target.classList.contains('cloze-item')) return;
        if (!cardFullySolved) return;
        
        isDragging = true;
        hasMoved = false; 
        startX = e.touches[0].clientX; startY = e.touches[0].clientY;
        currentX = startX; currentY = startY;
        
        currentCardEl.style.transition = 'none'; 
    });

    currentCardEl.addEventListener('touchmove', (e) => {
        if (!isDragging || !cardFullySolved) return;
        
        hasMoved = true; 
        
        currentX = e.touches[0].clientX; currentY = e.touches[0].clientY;
        const deltaX = currentX - startX; const deltaY = currentY - startY;
        const isHorizontal = Math.abs(deltaX) > Math.abs(deltaY);
        const isSwipeUp = deltaY < 0 && Math.abs(deltaY) > Math.abs(deltaX);

        if (isHorizontal || isSwipeUp) {
            if (e.cancelable) e.preventDefault(); 
            let rotation = deltaX * 0.05;
            if (isSwipeUp) currentCardEl.style.transform = `translate(${deltaX * 0.5}px, ${deltaY}px)`;
            else currentCardEl.style.transform = `translate(${deltaX}px, ${deltaY * 0.2}px) rotate(${rotation}deg)`;

            // Klassen resetten
            currentCardEl.classList.remove('border-green', 'border-red', 'border-blue');
            
            // Klassen setzen
            if (isSwipeUp && Math.abs(deltaY) > 50) currentCardEl.classList.add('border-blue');
            else if (deltaX > 50) currentCardEl.classList.add('border-green');
            else if (deltaX < -50) currentCardEl.classList.add('border-red');
        }
    });

    currentCardEl.addEventListener('touchend', (e) => {
        if (!isDragging) return;
        isDragging = false;
        
        if (!hasMoved) return;

        const deltaX = currentX - startX; const deltaY = currentY - startY;
        const threshold = 80; 
        
        currentCardEl.style.transition = 'transform 0.3s ease-out';
        
        const isHorizontal = Math.abs(deltaX) > Math.abs(deltaY);
        const isSwipeUp = deltaY < -threshold && Math.abs(deltaY) > Math.abs(deltaX);

        if (isSwipeUp) animateSwipe('up');
        else if (deltaX > threshold && isHorizontal) animateSwipe('right');
        else if (deltaX < -threshold && isHorizontal) animateSwipe('left');
        else { 
            currentCardEl.style.transform = ''; 
            currentCardEl.classList.remove('border-green', 'border-red', 'border-blue');
        }
    });

    function animateSwipe(direction) {
        currentCardEl.classList.add('animating');
        if (direction === 'left') currentCardEl.classList.add('fly-left', 'border-red');
        else if (direction === 'right') currentCardEl.classList.add('fly-right', 'border-green');
        else currentCardEl.classList.add('fly-up', 'border-blue');
        setTimeout(() => handleCardResult(direction), 10); 
    }

    currentCardEl.addEventListener('click', (e) => {
        if (isDragging) return;
        if (e.target.closest('button') || e.target.closest('#infoSection') || e.target.closest('.answer-box')) return;
        if (cardFullySolved) return;
        if (currentCardData && currentCardData.type === 'cloze') revealSingleCloze();
        else revealAllContent();
    });

    backToMenuFromOverviewBtn.addEventListener('click', () => { deckOverview.classList.add('hidden'); menuView.classList.remove('hidden'); });
    backToOverviewBtn.addEventListener('click', () => loadDeckData(currentDeckName, currentDeckFile));
    startSessionBtn.addEventListener('click', () => startSession('normal'));
    startLaterSessionBtn.addEventListener('click', () => startSession('later'));
    resetDeckBtn.addEventListener('click', resetDeck);

    const startBlur = (e) => { e.preventDefault(); document.body.classList.add('blur-mode'); };
    const endBlur = (e) => { if(e) e.preventDefault(); document.body.classList.remove('blur-mode'); };
    blurBtn.addEventListener('mousedown', startBlur); blurBtn.addEventListener('touchstart', startBlur);
    blurBtn.addEventListener('mouseup', endBlur); blurBtn.addEventListener('touchend', endBlur);

    // HIER WURDE DER INFO-BUTTON LISTENER ENTFERNT

    function shuffleArray(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
        return array;
    }
});
