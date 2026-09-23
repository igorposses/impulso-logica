const TOTAL_QUESTIONS = 15;
const COMPETITION_DURATION_MS = 90 * 60 * 1000;
const REQUESTS_KEY = 'hackathon_requests';
const STUDENT_NAME_KEY = 'hackathon_student_name';
const CLASS_ID_KEY = 'hackathon_class_id';
const COMPETITION_STATE_KEY = 'hackathon_competition_state';
const STUDENT_PROFILE_KEY = 'hackathon_student_profile';
const CLASS_ROSTERS = {
    '1 INFO 01': ['ANABELLY SILVA SABINO', 'BRENO BENEVIDES MENDES', 'DANIELLE DOS SANTOS DA SILVA', 'DAVI SILVA FERREIRA', 'EMILY COELHO MACHADO', 'ERICK SANTOS SILVA', 'EVELLYN SOUZA FERREIRA', 'GABRIELLY NASCIMENTO MARINHO', 'HEITOR MATTOS PONTES', 'HIAGO DA SILVA COSTA', 'ISABEL ANTONINA ROSARIO DA SILVA AZEVEDO', 'JOAO EMANOEL RODRIGUES SIQUEIRA', 'JOSE HENRIQUE MOLINAROLI COUTO', 'KAIO XAVIER FREITAS', 'KALEBE DE MELO ARAUJO', 'LUI ICHIRO DA SILVA SOUZA VIEIRA', 'LUIZA SENA SANTOS', 'MARIA EDUARDA GABRIEL PEREIRA', 'MATHEUS BASTOS RIBEIRO DA ROCHA', 'MILENA ARAGAO PEDRA JESUS', 'PAULO HENRIQUE ALVES DE SOUZA', 'RAPHAEL FERREIRA DA COSTA', 'RAYLLA CORREA DE OLIVEIRA', 'RENAN VASCONCELLOS PEREIRA', 'RIQUELME DOS SANTOS OLIVEIRA', 'SAMILLA PAIXAO BISPO', 'STHEFANY DUTRA RAMOS', 'VITORIA ADRIANO RODRIGUES', 'WLADIMIR DOS SANTOS FERREIRA', 'YASMIM JESUS HARKBART', 'YASMIN DOS SANTOS CARLINI', 'YOHANA DIAS OLIVEIRA', 'VENUS AURORA', 'DAVI DUARTE GALDINO'],
    '1 INFO 02': ['ADRYAN GUERRA DOS SANTOS', 'AGATHA LYRA SANTANA', 'ALESSANDRA NASCIMENTO FERNANDES', 'ANA KETHELLY OLIVEIRA CHAGAS', 'ANTONY FALCAO BARROS', 'CARLOS MANOEL COSME DA SILVA', 'ESTEVAO GABRIEL DE PAULA ALVES', 'EZEQUIEL OLIVEIRA DE SOUSA', 'HELLOA RAMOS RIBEIRO', 'HELOYSA RODRIGUES SABINO ALVES', 'INGRID VITORIA ALVES RODRIGUES', 'ISABELLA AMARAL CHAVES', 'ISABELLY GOMES DA SILVA', 'JOAO GUILHERME MENDES', 'JULIA VITORIA GARCIA MARCULANO', 'JULYE SOARES DIAS', 'KARINE CIRIACO SILVA', 'LAVINIA RODRIGUES DA ROCHA', 'LUIZ GUSTAVO DE ALMEIDA FERREIRA', 'MATEUS CAUA CARDOSO DOS SANTOS', 'MYRIAN RIBEIRO ALVES', 'PEDRO HENRIQUE DE SOUZA SILVA', 'PYETRO NUNES DOS SANTOS', 'RAQUEL CARDOSO LIMA', 'RENAN NASCIMENTO PEREIRA', 'SAMIRA OLIVEIRA DA SILVA', 'STEFANY DA SILVA SANTOS', 'VICTORIA VIANA DE ASSIS']
};
const SUPABASE_URL = 'https://ezfpxqpcgknmtglcvecn.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_ER9lLXcphbZKK1YwBFUPqQ_gq5TlGDg';
const TEACHER_PASSWORD = '78563';
let supabaseClient = null;
let requestsCache = null;
let competitionStartCache = null;
let persistenceMode = 'localStorage';
let knownRequestStatuses = null;
let previousRankingOrder = null;
let previousFirstPlace = null;
let competitionFinished = false;
let competitionStateCache = null;
let dataLoadGeneration = 0;
let competitionPausedMs = 0;

function getClassId() {
    return localStorage.getItem(CLASS_ID_KEY) || '';
}

function getLocalCompetitionState() {
    try {
        return JSON.parse(localStorage.getItem(`${COMPETITION_STATE_KEY}:${getClassId()}`)) || null;
    } catch {
        return null;
    }
}

function saveLocalCompetitionState(state) {
    localStorage.setItem(`${COMPETITION_STATE_KEY}:${getClassId()}`, JSON.stringify(state));
}

function selectClass(classId) {
    dataLoadGeneration += 1;
    localStorage.setItem(CLASS_ID_KEY, classId);
    localStorage.removeItem(STUDENT_NAME_KEY);
    localStorage.removeItem(STUDENT_PROFILE_KEY);
    requestsCache = null;
    competitionStateCache = null;
    competitionStartCache = 0;
    knownRequestStatuses = null;
    competitionFinished = false;
    competitionPausedMs = 0;
    document.getElementById('class-selection').classList.add('hidden');
    updateViews();
    loadSupabaseData();
}

function changeClass() {
    localStorage.removeItem(CLASS_ID_KEY);
    location.reload();
}

function createRequestId() {
    if (window.crypto?.randomUUID) {
        return window.crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
        const random = Math.random() * 16 | 0;
        const value = character === 'x' ? random : (random & 0x3 | 0x8);
        return value.toString(16);
    });
}

function getCompetitionStart() {
    return competitionStartCache || 0;
}

function setLocalStorageFallback(error) {
    persistenceMode = 'localStorage';
    supabaseClient = null;
    console.warn('Supabase indisponível; usando localStorage como fallback explícito.', error);
}

function normalizeRequest(request) {
    const normalized = {
        ...request,
        student: request.student || request.team || 'Aluno sem nome',
        createdAt: request.createdAt || (request.created_at ? Date.parse(request.created_at) : Date.now()),
        firstAttempt: request.firstAttempt !== undefined ? request.firstAttempt : request.first_attempt
        ,class_id: request.class_id || getClassId(),
        officialStudent: request.officialStudent || request.official_student || request.student,
        nickname: request.nickname || ''
    };
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(normalized.id))) {
        normalized.id = createRequestId();
    }
    return normalized;
}

function updateCountdown() {
    const countdown = document.getElementById('countdown');
    if (!countdown || competitionFinished) {
        return;
    }

    const start = getCompetitionStart();
    if (!start) {
        countdown.textContent = 'AGUARDANDO';
        countdown.classList.remove('warning', 'expired');
        return;
    }
    
    const isPaused = competitionStateCache?.paused_at !== null && competitionStateCache?.paused_at !== undefined;
    const elapsedTime = isPaused 
        ? (Date.parse(competitionStateCache.paused_at) - start) + (competitionStateCache?.pause_accumulated_ms || 0)
        : (Date.now() - start) + (competitionStateCache?.pause_accumulated_ms || 0);
    
    const remaining = Math.max(0, COMPETITION_DURATION_MS - elapsedTime);
    const totalSeconds = Math.floor(remaining / 1000);
    const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
    const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
    const seconds = String(totalSeconds % 60).padStart(2, '0');
    countdown.textContent = `${hours}:${minutes}:${seconds}`;
    countdown.classList.toggle('warning', remaining <= 10 * 60 * 1000 && remaining > 0);
    countdown.classList.toggle('paused', isPaused);

    if (remaining === 0) {
        finishCompetition();
    }
}

function getRequests() {
    if (requestsCache) {
        return requestsCache.map(normalizeRequest);
    }
    try {
        const requests = JSON.parse(localStorage.getItem(REQUESTS_KEY)) || [];
        requestsCache = requests.map(normalizeRequest).filter((request) => request.class_id === getClassId());
        return requestsCache;
    } catch (error) {
        console.error('Não foi possível carregar os chamados salvos.', error);
        return [];
    }
}

function saveRequests(requests) {
    requestsCache = requests.map(normalizeRequest);
    const allRequests = JSON.parse(localStorage.getItem(REQUESTS_KEY) || '[]')
        .map(normalizeRequest)
        .filter((request) => request.class_id !== getClassId());
    localStorage.setItem(REQUESTS_KEY, JSON.stringify([...allRequests, ...requests]));
    window.dispatchEvent(new Event('storage'));
    persistRequests(requests);
}

async function persistRequests(requests) {
    if (!supabaseClient) return;
    const rows = requests.map((request) => ({
        id: String(request.id),
        student: request.student,
        official_student: request.officialStudent || request.student,
        nickname: request.nickname || null,
        task: Number(request.task),
        status: request.status,
        first_attempt: request.firstAttempt !== false,
        created_at: new Date(request.createdAt || Date.now()).toISOString()
        ,class_id: getClassId()
    }));
    const { error } = await supabaseClient.from('requests').upsert(rows);
    if (error) console.warn('Não foi possível salvar requests no Supabase.', error);
}

async function persistCompetitionStart(start) {
    if (!supabaseClient) {
        saveLocalCompetitionState(competitionStateCache);
        return;
    }
    const { error } = await supabaseClient.from('competition_state').upsert({
        class_id: getClassId(),
        started_at: new Date(start).toISOString(),
        released_at: competitionStateCache?.released_at || new Date().toISOString()
    }, { onConflict: 'class_id' });
    if (error) console.warn('Não foi possível salvar o estado do cronômetro.', error);
}

async function loadSupabaseData() {
    if (!getClassId()) return;
    const loadGeneration = ++dataLoadGeneration;
    const classId = getClassId();
    competitionStateCache = getLocalCompetitionState();
    competitionStartCache = competitionStateCache?.started_at ? Date.parse(competitionStateCache.started_at) : 0;
    if (!window.supabase || typeof window.supabase.createClient !== 'function') {
        setLocalStorageFallback(new Error('CDN supabase-js não carregou.'));
        return;
    }
    try {
        supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        const [requestsResult, stateResult] = await Promise.all([
            supabaseClient.from('requests').select('*').eq('class_id', classId).order('created_at', { ascending: true }),
            supabaseClient.from('competition_state').select('*').eq('class_id', classId).maybeSingle()
        ]);
        if (requestsResult.error) throw requestsResult.error;
        if (stateResult.error) throw stateResult.error;
        if (loadGeneration !== dataLoadGeneration || classId !== getClassId()) return;

        const localRequests = getRequests();
        if (requestsResult.data.length) {
            requestsCache = requestsResult.data.map(normalizeRequest);
            const otherClassRequests = (JSON.parse(localStorage.getItem(REQUESTS_KEY) || '[]'))
                .map(normalizeRequest)
                .filter((request) => request.class_id !== classId);
            localStorage.setItem(REQUESTS_KEY, JSON.stringify([...otherClassRequests, ...requestsCache]));
        } else {
            requestsCache = [];
            const otherClassRequests = (JSON.parse(localStorage.getItem(REQUESTS_KEY) || '[]'))
                .map(normalizeRequest)
                .filter((request) => request.class_id !== classId);
            localStorage.setItem(REQUESTS_KEY, JSON.stringify(otherClassRequests));
        }

        competitionStateCache = stateResult.data || competitionStateCache;
        competitionStartCache = competitionStateCache?.started_at ? Date.parse(competitionStateCache.started_at) : 0;
        persistenceMode = 'supabase';
        subscribeToSupabase();
        updateViews();
    } catch (error) {
        setLocalStorageFallback(error);
    }
}

function subscribeToSupabase() {
    if (!supabaseClient) return;
    supabaseClient.channel(`hackathon-live-${getClassId()}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'requests', filter: `class_id=eq.${getClassId()}` }, (payload) => {
            const current = getRequests();
            const incoming = normalizeRequest(payload.new || payload.old);
            if (payload.eventType === 'DELETE') {
                requestsCache = current.filter((request) => String(request.id) !== String(incoming.id));
            } else {
                const index = current.findIndex((request) => String(request.id) === String(incoming.id));
                requestsCache = index === -1 ? [...current, incoming] : current.map((request, i) => i === index ? incoming : request);
            }
            const otherClassRequests = (JSON.parse(localStorage.getItem(REQUESTS_KEY) || '[]'))
                .map(normalizeRequest)
                .filter((request) => request.class_id !== getClassId());
            localStorage.setItem(REQUESTS_KEY, JSON.stringify([...otherClassRequests, ...requestsCache]));
            updateViews();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'competition_state', filter: `class_id=eq.${getClassId()}` }, (payload) => {
            competitionStateCache = payload.new || null;
            competitionStartCache = payload.new?.started_at ? Date.parse(payload.new.started_at) : 0;
            updateCountdown();
            updateViews();
        })
        .subscribe();
}

function getStudentName() {
    return getStudentProfile().displayName || '';
}

function getStudentProfile() {
    try {
        return JSON.parse(localStorage.getItem(STUDENT_PROFILE_KEY)) || {};
    } catch {
        return {};
    }
}

function formatStudentName(name) {
    const parts = name.trim().toLocaleLowerCase('pt-BR').split(/\s+/);
    if (parts.length < 2) return parts[0] || '';
    return `${parts[0][0].toLocaleUpperCase('pt-BR')}${parts[0].slice(1)} ${parts[1][0].toLocaleUpperCase('pt-BR')}.`;
}

function getStudentKey(request) {
    return String(request?.officialStudent || request?.student || '').trim().toLocaleLowerCase('pt-BR');
}

function populateStudentOptions() {
    const select = document.getElementById('student-name');
    if (!select) return;
    const roster = CLASS_ROSTERS[getClassId()] || [];
    select.innerHTML = '<option value="">Escolha seu nome</option>';
    roster.forEach((name) => {
        const option = document.createElement('option');
        option.value = name;
        option.textContent = formatStudentName(name);
        select.appendChild(option);
    });
}

function toggleNicknameInput() {
    const input = document.getElementById('student-nickname');
    const enabled = document.getElementById('use-nickname').checked;
    input.style.display = enabled ? 'block' : 'none';
    if (!enabled) input.value = '';
}

function navigate(viewId) {
    const view = document.getElementById(viewId);
    if (!view) {
        console.error(`Tela não encontrada: ${viewId}`);
        return;
    }

    document.querySelectorAll('.view').forEach((item) => item.classList.remove('active'));
    view.classList.add('active');
    updateViews();
}

function loginTeacher() {
    const input = document.getElementById('teacher-password-input');
    const password = input ? input.value : '';
    const errorMsg = document.getElementById('teacher-login-error');
    
    if (password !== TEACHER_PASSWORD) {
        if (errorMsg) errorMsg.style.display = 'block';
        if (input) {
            input.value = '';
            input.focus();
        }
        return;
    }
    
    if (errorMsg) errorMsg.style.display = 'none';
    if (input) input.value = '';
    navigate('teacher-view');
}

async function releaseChallenge() {
    if (!getClassId()) {
        alert('Selecione uma turma antes de liberar o desafio.');
        return;
    }
    competitionStateCache = {
        ...(competitionStateCache || {}),
        class_id: getClassId(),
        released_at: new Date().toISOString(),
        started_at: competitionStateCache?.started_at || null
    };
    saveLocalCompetitionState(competitionStateCache);
    if (!supabaseClient) {
        updateViews();
        return;
    }
    const { error } = await supabaseClient.from('competition_state').upsert(competitionStateCache, { onConflict: 'class_id' });
    if (error) return alert('Não foi possível liberar o desafio.');
    updateViews();
}

async function startCompetition() {
    if (!competitionStateCache?.released_at) {
        alert('Libere o desafio antes de iniciar o cronômetro.');
        return;
    }
    const start = Date.now();
    competitionStartCache = start;
    competitionStateCache.started_at = new Date(start).toISOString();
    competitionStateCache.paused_at = null;
    competitionStateCache.pause_accumulated_ms = 0;
    saveLocalCompetitionState(competitionStateCache);
    await persistCompetitionStart(start);
    competitionFinished = false;
    updateCountdown();
    updateViews();
}

async function togglePauseCompetition() {
    if (!competitionStateCache?.started_at || competitionFinished) {
        return;
    }

    const isPaused = competitionStateCache?.paused_at !== null && competitionStateCache?.paused_at !== undefined;
    
    if (isPaused) {
        // Retomar
        const pausedDuration = Date.now() - Date.parse(competitionStateCache.paused_at);
        competitionStateCache.pause_accumulated_ms = (competitionStateCache.pause_accumulated_ms || 0) + pausedDuration;
        competitionStateCache.paused_at = null;
    } else {
        // Pausar
        competitionStateCache.paused_at = new Date().toISOString();
    }

    saveLocalCompetitionState(competitionStateCache);
    if (supabaseClient) {
        const { error } = await supabaseClient.from('competition_state').upsert({
            class_id: getClassId(),
            started_at: competitionStateCache.started_at,
            released_at: competitionStateCache.released_at,
            paused_at: competitionStateCache.paused_at,
            pause_accumulated_ms: competitionStateCache.pause_accumulated_ms || 0
        }, { onConflict: 'class_id' });
        if (error) {
            alert('Erro ao sincronizar pausa. Tente novamente.');
            console.error('Erro ao pausar competição:', error);
        }
    }
    
    updateCountdown();
    updateViews();
}

async function clearClassData() {
    if (!confirm(`Apagar todos os dados da turma ${getClassId()}? Esta ação não pode ser desfeita.`)) return;
    const classId = getClassId();
    dataLoadGeneration += 1;
    requestsCache = [];
    localStorage.setItem(REQUESTS_KEY, JSON.stringify(
        (JSON.parse(localStorage.getItem(REQUESTS_KEY) || '[]'))
            .filter((request) => request.class_id !== classId)
    ));
    competitionStateCache = null;
    competitionStartCache = 0;
    competitionFinished = false;
    competitionPausedMs = 0;
    localStorage.removeItem(`${COMPETITION_STATE_KEY}:${classId}`);
    if (supabaseClient) {
        const [requestsResult, stateResult] = await Promise.all([
            supabaseClient.from('requests').delete().eq('class_id', classId),
            supabaseClient.from('competition_state').delete().eq('class_id', classId)
        ]);
        if (requestsResult.error || stateResult.error) {
            const error = requestsResult.error || stateResult.error;
            console.error('Não foi possível apagar todos os dados da turma.', error);
            alert('Os dados locais foram apagados, mas não foi possível apagar os dados compartilhados. Verifique a conexão e tente novamente.');
        }
    }
    updateViews();
}

function saveStudentName() {
    const nameInput = document.getElementById('student-name');
    const officialName = nameInput.value.trim();
    const useNickname = document.getElementById('use-nickname').checked;
    const nickname = document.getElementById('student-nickname').value.trim();

    if (!officialName) {
        alert('Selecione seu nome para continuar.');
        nameInput.focus();
        return;
    }
    if (useNickname && !nickname) {
        alert('Digite o apelido que será exibido no ranking.');
        document.getElementById('student-nickname').focus();
        return;
    }

    const profile = {
        officialName,
        officialDisplayName: formatStudentName(officialName),
        displayName: useNickname ? nickname : formatStudentName(officialName),
        nickname: useNickname ? nickname : ''
    };
    localStorage.setItem(STUDENT_PROFILE_KEY, JSON.stringify(profile));
    localStorage.setItem(STUDENT_NAME_KEY, profile.displayName);
    updateStudentIdentity();
    renderQuestionChoices(getRequests());
    showStudentMessage('✅ Nome salvo! Ele ficará disponível neste navegador.');
}

function changeStudentName() {
    localStorage.removeItem(STUDENT_NAME_KEY);
    localStorage.removeItem(STUDENT_PROFILE_KEY);
    populateStudentOptions();
    updateStudentIdentity();
    document.getElementById('student-name').focus();
}

function submitTask() {
    if (!competitionStateCache?.released_at || !getCompetitionStart()) {
        showStudentMessage('Aguarde o professor liberar e iniciar o desafio.');
        return;
    }
    if (competitionFinished || Date.now() >= getCompetitionStart() + COMPETITION_DURATION_MS) {
        finishCompetition();
        showStudentMessage('O tempo do desafio acabou.');
        return;
    }

    const student = getStudentName();
    const profile = getStudentProfile();
    const taskInput = document.getElementById('student-task');
    const task = Number(taskInput.value);

    if (!student) {
        alert('Cadastre seu nome antes de enviar uma questão.');
        document.getElementById('student-name').focus();
        return;
    }

    if (!Number.isInteger(task) || task < 1 || task > TOTAL_QUESTIONS) {
        alert(`Informe uma questão entre 1 e ${TOTAL_QUESTIONS}.`);
        document.getElementById('question-choices').focus();
        return;
    }

    const requests = getRequests();
    const alreadySent = requests.some((request) =>
        String(request.officialStudent || request.student || '').toLowerCase() === String(profile.officialName || student).toLowerCase() &&
        Number(request.task) === task &&
        request.status !== 'rejected'
    );

    if (alreadySent) {
        showStudentMessage('Essa questão já foi enviada ou aprovada.');
        return;
    }

    const firstAttempt = !requests.some((request) =>
        String(request.officialStudent || request.student || '').toLowerCase() === String(profile.officialName || student).toLowerCase() &&
        Number(request.task) === task
    );
    requests.push({
        id: createRequestId(),
        student,
        officialStudent: profile.officialName,
        nickname: profile.nickname,
        task,
        status: 'pending',
        firstAttempt,
        class_id: getClassId(),
        createdAt: Date.now()
    });
    saveRequests(requests);
    taskInput.value = '';
    renderQuestionChoices(getRequests());
    showStudentMessage('✅ Chamado enviado! O professor já está indo verificar.');
}

function showStudentMessage(message) {
    const messageElement = document.getElementById('student-msg');
    messageElement.innerText = message;
    setTimeout(() => {
        messageElement.innerText = '';
    }, 4000);
}

function showToast(title, message, type = '') {
    const container = document.getElementById('toast-container');
    if (!container) {
        return;
    }

    const toast = document.createElement('div');
    toast.className = `toast ${type}`.trim();
    const icon = type === 'approved' ? '✅' : type === 'rejected' ? '❌' : '📣';
    toast.innerHTML = `
        <span class="toast-icon">${icon}</span>
        <span class="toast-message"><strong>${escapeHtml(title)}</strong>${escapeHtml(message)}</span>
    `;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 6000);
}

function notifyRequestChanges(requests) {
    const currentStatuses = new Map(requests.map((request) => [request.id, request.status]));
    if (knownRequestStatuses === null) {
        knownRequestStatuses = currentStatuses;
        return;
    }

    requests.forEach((request) => {
        const previousStatus = knownRequestStatuses.get(request.id);
        if (previousStatus === undefined && request.status === 'pending') {
            showToast(
                'Novo desafio enviado',
                `${request.student} enviou o desafio ${request.task} para aprovação.`
            );
        } else if (previousStatus === 'pending' && request.status === 'approved') {
            showToast(
                'Desafio aprovado!',
                `O desafio ${request.task} de ${request.student} foi aprovado.`,
                'approved'
            );
            playSound('approve');
        } else if (previousStatus === 'pending' && request.status === 'rejected') {
            showToast(
                'Desafio não aprovado',
                `O desafio ${request.task} de ${request.student} foi rejeitado.`,
                'rejected'
            );
            if (getStudentKey(request) === String(getStudentProfile().officialName || '').toLowerCase()) {
                playSound('reject');
            }
        }
    });

    knownRequestStatuses = currentStatuses;
}

function handleRequest(id, status) {
    if (!getCompetitionStart()) {
        return;
    }

    const requests = getRequests();
    const request = requests.find((item) => item.id === id);
    if (!request) {
        return;
    }

    request.status = status;
    saveRequests(requests);
}

function playSound(type) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
        return;
    }

    const context = new AudioContextClass();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const isError = type === 'reject';
    const isRise = type === 'level-up';
    oscillator.type = isError ? 'sine' : 'triangle';
    oscillator.frequency.setValueAtTime(isError ? 180 : isRise ? 660 : 520, context.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(isError ? 110 : isRise ? 990 : 780, context.currentTime + .16);
    gain.gain.setValueAtTime(.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(isError ? .045 : .08, context.currentTime + .02);
    gain.gain.exponentialRampToValueAtTime(.0001, context.currentTime + .22);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + .23);
    oscillator.addEventListener('ended', () => context.close());
}

function updateStudentIdentity() {
    const registration = document.getElementById('student-registration');
    const registeredStudent = document.getElementById('registered-student');
    const profile = getStudentProfile();
    const student = profile.displayName || getStudentName();

    if (student) {
        registration.style.display = 'none';
        registeredStudent.innerHTML = '';
        const name = document.createElement('span');
        name.textContent = `Aluno: ${student}`;
        const changeButton = document.createElement('button');
        changeButton.className = 'btn-outline';
        changeButton.textContent = 'Alterar nome';
        changeButton.onclick = changeStudentName;
        registeredStudent.append(name, changeButton);
        registeredStudent.style.display = 'flex';
    } else {
        registration.style.display = 'flex';
        registeredStudent.style.display = 'none';
    }
    populateStudentOptions();
    toggleNicknameInput();
}

function selectTask(task, input) {
    document.querySelectorAll('.question-choice input').forEach((item) => {
        if (item !== input) item.checked = false;
    });
    input.closest('.question-choice').classList.toggle('selected', input.checked);
    document.getElementById('student-task').value = input.checked ? task : '';
}

function renderQuestionChoices(requests) {
    const container = document.getElementById('question-choices');
    if (!container) return;
    const profile = getStudentProfile();
    const studentKey = String(profile.officialName || '').toLowerCase();
    const studentRequests = requests.filter((request) =>
        getStudentKey(request) === studentKey
    );
    const approved = new Set(studentRequests.filter((request) => request.status === 'approved').map((request) => Number(request.task)));
    const pending = new Set(studentRequests.filter((request) => request.status === 'pending').map((request) => Number(request.task)));
    const rejected = [...new Set(studentRequests.filter((request) => request.status === 'rejected').map((request) => Number(request.task)))];
    container.innerHTML = Array.from({ length: TOTAL_QUESTIONS }, (_, index) => index + 1)
        .map((task) => {
            const isApproved = approved.has(task);
            const isPending = pending.has(task);
            const isRejected = rejected.includes(task);
            const stateClass = isApproved ? 'approved' : isPending ? 'pending' : isRejected ? 'rejected' : '';
            const stateText = isApproved ? 'Aprovado' : isPending ? 'Em validação' : isRejected ? 'Tentar novamente' : 'Disponível';
            const disabled = isApproved || isPending ? 'disabled' : '';
            return `
                <label class="question-choice ${stateClass}">
                    <input type="checkbox" ${disabled} onchange="selectTask(${task}, this)">
                    <span>Mapa ${task}</span>
                    <small>${stateText}</small>
                </label>
            `;
        }).join('');
}

function renderPendingTasks(requests) {
    const pendingContainer = document.getElementById('pending-tasks');
    const pending = requests.filter((request) => request.status === 'pending');
    pendingContainer.innerHTML = '';

    if (pending.length === 0) {
        pendingContainer.innerHTML = '<p style="text-align:center; color:#8b949e;">Nenhum chamado no momento.</p>';
        return;
    }

    pending.forEach((request) => {
        const card = document.createElement('div');
        card.className = 'task-card';
        card.innerHTML = `
            <span><strong>Aluno:</strong> ${escapeHtml(request.student)}
                <br><span style="color:#8b949e; font-size:14px">Questão: ${request.task}</span>
            </span>
            <div class="task-actions">
                <button class="btn-approve" onclick="handleRequest('${request.id}', 'approved')" title="Aprovar">✓</button>
                <button class="btn-reject" onclick="handleRequest('${request.id}', 'rejected')" title="Rejeitar">X</button>
            </div>
        `;
        pendingContainer.appendChild(card);
    });
}

function renderRanking(requests) {
    const scores = {};
    const firstRequest = [...requests].sort((a, b) => (a.createdAt || a.id) - (b.createdAt || b.id))[0];
    const firstBloodStudent = getStudentKey(firstRequest);
    const streaks = {};
    const attemptsByTask = {};

    [...requests]
        .sort((a, b) => (a.createdAt || a.id) - (b.createdAt || b.id))
        .forEach((request) => {
            const studentKey = getStudentKey(request);
            const taskKey = `${studentKey}:${request.task}`;
            const firstAttempt = request.firstAttempt !== undefined
                ? request.firstAttempt
                : !attemptsByTask[taskKey];
            attemptsByTask[taskKey] = true;

            if (request.status === 'rejected') {
                streaks[studentKey] = 0;
            } else if (request.status === 'approved' && firstAttempt) {
                streaks[studentKey] = (streaks[studentKey] || 0) + 1;
            }
        });

    requests.filter((request) => request.status === 'approved').forEach((request) => {
        const key = getStudentKey(request);
        if (!scores[key]) {
            scores[key] = {
                student: request.student,
                officialStudent: request.officialStudent || request.student,
                nickname: request.nickname || '',
                questions: new Set(),
                streak: streaks[key] || 0,
                firstBlood: key === firstBloodStudent
            };
        }
        scores[key].questions.add(Number(request.task));
    });

    const ranking = Object.values(scores)
        .map((entry) => ({ ...entry, score: entry.questions.size }))
        .sort((a, b) => b.score - a.score || a.student.localeCompare(b.student));

    const currentOrder = ranking.map((entry) => entry.student.toLowerCase());
    const rankingChanged = previousRankingOrder !== null &&
        currentOrder.join('|') !== previousRankingOrder.join('|');
    ranking.forEach((entry, index) => {
        entry.moved = rankingChanged && previousRankingOrder[index] !== currentOrder[index];
    });
    if (previousRankingOrder && currentOrder.join('|') !== previousRankingOrder.join('|')) {
        const firstPlace = currentOrder[0];
        if (previousFirstPlace && firstPlace !== previousFirstPlace) {
            launchConfetti();
        }
        const someoneAdvanced = currentOrder.some((student, index) => {
            const oldIndex = previousRankingOrder.indexOf(student);
            return oldIndex !== -1 && index < oldIndex;
        });
        if (someoneAdvanced) {
            playSound('level-up');
        }
    }
    previousRankingOrder = currentOrder;
    previousFirstPlace = currentOrder[0] || null;

    const fullRankingBody = document.getElementById('ranking-body');
    if (fullRankingBody) {
        fullRankingBody.innerHTML = ranking.length === 0
            ? '<tr><td colspan="3" style="text-align:center; color:#8b949e">Aguardando pontuações...</td></tr>'
            : ranking.map((entry, index) => createFullRankingRow(entry, index)).join('');
    }

    const homeRankingBody = document.getElementById('home-ranking-body');
    if (homeRankingBody) {
        homeRankingBody.innerHTML = ranking.length === 0
            ? '<div class="empty-ranking">Aguardando as primeiras pontuações...</div>'
            : ranking.slice(0, 10).map((entry, index) => createPreviewRankingRow(entry, index)).join('');
    }
}

function createFullRankingRow(entry, index) {
    const percentage = Math.round((entry.score / TOTAL_QUESTIONS) * 100);
    const badges = `${entry.streak >= 3 ? '<span class="streak-badge" title="Combo de 3 acertos">🔥</span>' : ''}${entry.firstBlood ? '<span class="first-blood-badge" title="Primeiro problema entregue">⭐</span>' : ''}`;
    const official = entry.nickname ? `<small class="official-name">${escapeHtml(formatStudentName(entry.officialStudent))}</small>` : '';
    return `
        <tr class="ranking-row${entry.moved ? ' ranking-moved' : ''}">
            <td><strong>${index + 1}º</strong></td>
            <td><span class="ranking-name">${escapeHtml(entry.student)}${badges}</span>${official}</td>
            <td class="progress-cell">
                <div class="progress-track" aria-label="${percentage}% concluído">
                    <div class="progress-bar" style="width: ${percentage}%"></div>
                </div>
                <span class="progress-label">${entry.score}/${TOTAL_QUESTIONS} questões (${percentage}%)</span>
            </td>
        </tr>
    `;
}

function createPreviewRankingRow(entry, index) {
    const percentage = Math.round((entry.score / TOTAL_QUESTIONS) * 100);
    const medals = ['🥇', '🥈', '🥉'];
    const badges = `${entry.streak >= 3 ? '<span class="streak-badge" title="Combo de 3 acertos">🔥</span>' : ''}${entry.firstBlood ? '<span class="first-blood-badge" title="Primeiro problema entregue">⭐</span>' : ''}`;
    const official = entry.nickname ? `<small class="official-name">${escapeHtml(formatStudentName(entry.officialStudent))}</small>` : '';
    return `
        <div class="preview-ranking-row">
            <span class="preview-position">${medals[index] || `${index + 1}º`}</span>
            <span class="preview-student"><span class="ranking-name">${escapeHtml(entry.student)}${badges}</span>${official}</span>
            <span class="preview-score">${entry.score}<small>/${TOTAL_QUESTIONS}</small></span>
            <div class="preview-progress"><span style="width: ${percentage}%"></span></div>
        </div>
    `;
}

function launchConfetti() {
    let container = document.getElementById('confetti-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'confetti-container';
        document.body.appendChild(container);
    }

    const colors = ['#04D9D9', '#0396A6', '#024059', '#010D26', '#ffffff'];
    for (let index = 0; index < 70; index += 1) {
        const piece = document.createElement('span');
        piece.className = 'confetti';
        piece.style.background = colors[index % colors.length];
        piece.style.left = `${Math.random() * 100}%`;
        piece.style.setProperty('--drift', `${(Math.random() - .5) * 220}px`);
        piece.style.animationDelay = `${Math.random() * .35}s`;
        container.appendChild(piece);
        setTimeout(() => piece.remove(), 2300);
    }
}

function finishCompetition() {
    if (competitionFinished) {
        return;
    }
    competitionFinished = true;
    const countdown = document.getElementById('countdown');
    countdown.textContent = '00:00:00';
    countdown.classList.add('expired');

    const ranking = getRanking(getRequests());
    const winner = ranking[0];
    document.getElementById('winner-name').textContent = winner?.student || 'Sem vencedor';
    document.getElementById('winner-score').textContent = winner
        ? `${winner.score}/${TOTAL_QUESTIONS} questões aprovadas`
        : 'Nenhuma questão foi aprovada.';
    const overlay = document.getElementById('victory-overlay');
    overlay.classList.add('visible');
    overlay.setAttribute('aria-hidden', 'false');
    launchConfetti();
}

function getRanking(requests) {
    const scores = {};
    requests.filter((request) => request.status === 'approved').forEach((request) => {
        const key = request.student.toLowerCase();
        if (!scores[key]) {
            scores[key] = { student: request.student, questions: new Set() };
        }
        scores[key].questions.add(Number(request.task));
    });
    return Object.values(scores)
        .map((entry) => ({ ...entry, score: entry.questions.size }))
        .sort((a, b) => b.score - a.score || a.student.localeCompare(b.student));
}

function escapeHtml(value) {
    const element = document.createElement('div');
    element.textContent = value;
    return element.innerHTML;
}

function updateViews() {
    const requests = getRequests();
    notifyRequestChanges(requests);
    updateStudentIdentity();
    renderQuestionChoices(requests);
    const classLabel = document.getElementById('selected-class-label');
    if (classLabel) classLabel.textContent = `Turma: ${getClassId()}`;
    const status = document.getElementById('competition-status');
    if (status) {
        status.textContent = competitionStateCache?.started_at
            ? (competitionStateCache?.paused_at ? '⏸ Cronômetro pausado.' : 'Cronômetro iniciado.')
            : competitionStateCache?.released_at ? 'Desafio liberado. Inicie o cronômetro.' : 'Desafio ainda não liberado.';
    }
    const releaseButton = document.getElementById('release-challenge-button');
    const startButton = document.getElementById('start-timer-button');
    const pauseButton = document.getElementById('pause-timer-button');
    const resumeButton = document.getElementById('resume-timer-button');
    
    if (releaseButton) releaseButton.disabled = Boolean(competitionStateCache?.released_at);
    if (startButton) startButton.disabled = !competitionStateCache?.released_at || Boolean(competitionStateCache?.started_at);
    
    const isPaused = competitionStateCache?.paused_at !== null && competitionStateCache?.paused_at !== undefined;
    const isStarted = Boolean(competitionStateCache?.started_at);
    
    if (pauseButton) {
        pauseButton.style.display = isStarted && !isPaused && !competitionFinished ? 'inline-block' : 'none';
    }
    if (resumeButton) {
        resumeButton.style.display = isStarted && isPaused && !competitionFinished ? 'inline-block' : 'none';
    }

    if (document.getElementById('teacher-view').classList.contains('active')) {
        renderPendingTasks(requests);
    }

    renderRanking(requests);
}

if (getClassId()) {
    document.getElementById('class-selection').classList.add('hidden');
    loadSupabaseData();
} else {
    document.getElementById('class-selection').classList.remove('hidden');
}
updateCountdown();
setInterval(updateCountdown, 1000);
window.addEventListener('storage', updateViews);
updateViews();

function closeVictoryOverlay() {
    const overlay = document.getElementById('victory-overlay');
    if (overlay) {
        overlay.classList.remove('visible');
        overlay.setAttribute('aria-hidden', 'true');
    }
}
