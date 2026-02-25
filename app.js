document.addEventListener('DOMContentLoaded', () => {
    
    // --- KONFIGURATION ---
    const DECKS_CONFIG = [
        { name: "Neurologie", file: "neurologie_karten.json" }, 
        { name: "Anatomie", file: "anatomie_karten.json" }
    ];

    // --- DOM ELEMENTE ---
    const menuView = document.getElementById('menuView');
    const deckOverview = document.getElementById('deckOverview');
    const gameView = document.getElementById('gameView');
    
    const deckList = document.getElementById('deckList');
    
    // Overview Elements
    const backToMenuFromOverviewBtn = document.getElementById('backToMenuFromOverviewBtn');
    const overviewTitle = document.getElementById('overviewTitle');
    
    // Nur noch relevante Stats
    const statNew = document.getElementById('statNew');
    const statDone = document.getElementById('statDone');
    const statTime = document.getElementById('statTime'); 
    
    const overviewProgressBar = document.getElementById('overviewProgressBar');
    const progressText = document.getElementById('progressText');
    
    const startSessionBtn = document.getElementById('startSessionBtn');
    const startDoneSessionBtn = document.getElementById('startDoneSessionBtn'); // Neu
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

    // --- STATE ---
    let fullDeck = []; 
    let sessionQueue = []; 
    let currentDeckName = "";
    let currentDeckFile = "";
    let currentSessionMode = 'normal'; // 'normal', 'later', 'done'
    
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
                    // Falls keine ID im JSON ist, nutzen wir den Index als Fallback
                    const id = (card.id !== undefined && card.id !== null) ? card.id : index;
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

        // Stats Logik: "Neu" beinhaltet alles was noch nicht fertig ist (Box 0, 1, 2)
        // Aber laut Anforderung: "nur Karten die sich in Box 0 befinden" anzeigen als Zahl
        // und "Box 3".
        
        const countBox0 = fullDeck.filter(c => c.box === 0 || c.box === undefined).length;
        const countLater = fullDeck.filter(c => c.box === 'later').length;
        const countDone = fullDeck.filter(c => c.box === 3).length;

        // Anzeige im Grid
        statNew.innerText = countBox0; 
        statDone.innerText = countDone;
        statTime.innerText = formatTime(totalTimeSeconds);

        const total = fullDeck.length;
        const percent = total > 0 ? Math.round((countDone / total) * 100) : 0;
        overviewProgressBar.style.width = `${percent}%`;
        progressText.innerText = `${percent}% Gemeistert`;

        // Buttons Sichtbarkeit
        startLaterSessionBtn.classList.toggle('hidden', countLater === 0);
        startDoneSessionBtn.classList.toggle('hidden', countDone === 0);
    }

    function startSession(mode = 'normal') {
        currentSessionMode = mode;
        deckOverview.classList.add('hidden');
        gameView.classList.remove('hidden');

        sessionQueue = [];
        
        if (mode === 'later') {
            sessionQueue = fullDeck.filter(c => c.box === 'later');
        } else if (mode === 'done') {
            sessionQueue = fullDeck.filter(c => c.box === 3);
        } else {
            // Normal: Alles was NICHT Box 3 und NICHT later ist
            sessionQueue = fullDeck.filter(c => c.box !== 3 && c.box !== 'later');
        }

        if(sessionQueue.length === 0) {
            if (mode === 'later') alert("Keine Karten im 'Später'-Stapel.");
            else if (mode === 'done') alert("Keine fertigen Karten vorhanden.");
            else alert("Alles erledigt! Du kannst fertige Karten über den Button wiederholen.");
            showDeckOverview();
            return;
        }

        if (mode === 'normal') {
            // WICHTIG: Nicht mischen, sondern nach ID sortieren
            sessionQueue.sort((a, b) => {
                // Versuchen als Zahl zu sortieren, falls IDs Zahlen sind
                return parseInt(a.id) - parseInt(b.id);
            });
        } else {
            // Later und Done können gemischt werden
            sessionQueue = shuffleArray(sessionQueue);
        }

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
        
        if(sessionQueue.length > 0) {
            loadCardToDOM(sessionQueue[0]);
            if (sessionQueue.length > 1) renderBackgroundCard(sessionQueue[1]);
            else nextCardEl.innerHTML = "<div class='card-content'>Ende</div>";
            updateGameStats();
        } else {
            // Sollte theoretisch nicht passieren durch advanceQueue Logic, aber zur Sicherheit
            alert("Lernsitzung beendet.");
            showDeckOverview();
        }
    }

    function advanceQueue() {
        if (sessionQueue.length === 0) {
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

    // HAUPT-ALGORITHMUS ÄNDERUNGEN HIER
    function handleCardResult(result) {
        if (!currentCardData) return;
        
        // Aktuelle Karte aus der Queue nehmen
        const processedCard = sessionQueue.shift(); 
        
        if (result === 'left') { 
            // FALSCH: Zurück auf Box 0
            const newBox = 0;
            processedCard.box = newBox;
            saveDeckStats(currentDeckName, processedCard.id, newBox);
            
            // Sofortige Wiedervorlage (Index 3, wie zuvor)
            const insertIndex = Math.min(sessionQueue.length, 3);
            sessionQueue.splice(insertIndex, 0, processedCard);
            
        } else if (result === 'right') { 
            // RICHTIG: Logik mit Verschiebung
            let currentBox = (processedCard.box === 'later') ? 0 : processedCard.box;
            
            // Wenn wir im "Done"-Modus lernen (Karten sind Box 3), bleiben sie Box 3, 
            // fliegen aber aus der SessionQueue raus, wenn sie gewusst wurden.
            if (currentSessionMode === 'done') {
                // Keine Änderung der Box, Karte ist fertig für diese Session
            } else {
                // Normaler Lernmodus
                let newBox = currentBox + 1;
                
                // Maximale Box ist 3
                if (newBox > 3) newBox = 3;
                
                processedCard.box = newBox;
                saveDeckStats(currentDeckName, processedCard.id, newBox);

                // Wiedereinreihung basierend auf der NEUEN Box
                let offset = 0;
                let reinsert = true;

                if (newBox === 1) {
                    offset = 5; // In 5 Karten wieder
                } else if (newBox === 2) {
                    offset = 8; // In 8 Karten wieder
                } else if (newBox === 3) {
                    // Box 3: In 15 Karten noch einmal anzeigen (Finale Prüfung)
                    // Wenn sie beim nächsten Mal kommt und Box 3 ist, wird sie nicht mehr erhöht,
                    // sondern fliegt raus (siehe 'else' unten).
                    // Da wir hier gerade erst AUF 3 gestiegen sind, müssen wir sie noch einmal einreihen.
                    offset = 15;
                } else {
                    // Falls aus irgendeinem Grund Box > 3 wäre (sollte nicht passieren durch if oben)
                    reinsert = false;
                }

                // Spezialfall: Wenn Karte schon Box 3 WAR und richtig beantwortet wurde, ist sie fertig.
                // Aber hier haben wir 'currentBox' geprüft. 
                // Wenn currentBox = 2 -> newBox = 3 -> reinsert with offset 15.
                // Wenn currentBox = 3 -> newBox = 3 (durch cap). Das bedeutet sie kam als Box 3 wieder.
                // Dann fliegt sie raus.
                if (currentBox === 3) {
                    reinsert = false;
                }

                if (reinsert) {
                    const insertIndex = Math.min(sessionQueue.length, offset);
                    sessionQueue.splice(insertIndex, 0, processedCard);
                }
            }

        } else if (result === 'up') { 
            // SPÄTER
            processedCard.box = 'later';
            saveDeckStats(currentDeckName, processedCard.id, 'later');
            // Fliegt aus der Queue raus
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
    startDoneSessionBtn.addEventListener('click', () => startSession('done')); // Neu
    resetDeckBtn.addEventListener('click', resetDeck);

    const startBlur = (e) => { e.preventDefault(); document.body.classList.add('blur-mode'); };
    const endBlur = (e) => { if(e) e.preventDefault(); document.body.classList.remove('blur-mode'); };
    blurBtn.addEventListener('mousedown', startBlur); blurBtn.addEventListener('touchstart', startBlur);
    blurBtn.addEventListener('mouseup', endBlur); blurBtn.addEventListener('touchend', endBlur);

    function shuffleArray(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
        return array;
    }
});