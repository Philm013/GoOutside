/**
 * BirdNET Live - Web Worker
 * Runs TensorFlow.js inference entirely in the browser.
 * Model and TF.js loaded from BirdNET team's public CDN.
 * Based on: https://github.com/birdnet-team/real-time-pwa (MIT License)
 */

/* ─── PATHS ─────────────────────────────────────────────────────────────── */
const TF_CDN = 'https://birdnet-team.github.io/real-time-pwa/js/tfjs-4.14.0.min.js';
const MODEL_BASE = 'https://birdnet-team.github.io/real-time-pwa/models/birdnet';
const MODEL_PATH = MODEL_BASE + '/model.json';
const AREA_MODEL_PATH = MODEL_BASE + '/area-model/model.json';
const LABELS_DIR = MODEL_BASE + '/labels';

importScripts(TF_CDN);

/* ─── CONSTANTS ─────────────────────────────────────────────────────────── */
const SAMPLE_RATE = 48000;
const WINDOW_SAMPLES = 144000; // 3 seconds at 48 kHz

/* ─── STATE ─────────────────────────────────────────────────────────────── */
let birdModel = null;
let areaModel = null;
let birds = [];

// Cache for re-applying geo priors without re-running inference
let lastPredictionList = null;
let lastMeans = null;
let lastHopSamples = null;
let lastNumFrames = 0;

/* ─── CUSTOM MEL SPECTROGRAM LAYER ──────────────────────────────────────── */
class MelSpecLayerSimple extends tf.layers.Layer {
    constructor(config) {
        super(config);
        this.sampleRate = config.sampleRate;
        this.specShape = config.specShape;
        this.frameStep = config.frameStep;
        this.frameLength = config.frameLength;
        this.melFilterbank = tf.tensor2d(config.melFilterbank);
    }

    build() {
        this.magScale = this.addWeight(
            'magnitude_scaling', [], 'float32',
            tf.initializers.constant({ value: 1.23 })
        );
        super.build();
    }

    computeOutputShape(inputShape) {
        return [inputShape[0], this.specShape[0], this.specShape[1], 1];
    }

    call(inputs) {
        return tf.tidy(() => {
            const x = inputs[0];
            return tf.stack(x.split(x.shape[0]).map(input => {
                let spec = input.squeeze();
                spec = tf.sub(spec, tf.min(spec, -1, true));
                spec = tf.div(spec, tf.max(spec, -1, true).add(1e-6));
                spec = tf.sub(spec, 0.5).mul(2.0);
                spec = tf.engine().runKernel('STFT', {
                    signal: spec,
                    frameLength: this.frameLength,
                    frameStep: this.frameStep
                });
                spec = tf.matMul(spec, this.melFilterbank).pow(2.0);
                spec = spec.pow(tf.div(1.0, tf.add(1.0, tf.exp(this.magScale.read()))));
                spec = tf.reverse(spec, -1);
                spec = tf.transpose(spec).expandDims(-1);
                return spec;
            }));
        });
    }

    static get className() { return 'MelSpecLayerSimple'; }
}

/* ─── STFT KERNEL (WebGL) ───────────────────────────────────────────────── */
tf.registerKernel({
    kernelName: 'STFT',
    backendName: 'webgl',
    kernelFunc: ({ backend, inputs: { signal, frameLength, frameStep } }) => {
        const innerDim = frameLength / 2;
        const batch = (signal.size - frameLength + frameStep) / frameStep | 0;

        let currentTensor = backend.runWebGLProgram({
            variableNames: ['x'],
            outputShape: [batch, frameLength],
            userCode: `void main(){
                ivec2 c=getOutputCoords();
                int p=c[1]%${innerDim};
                int k=0;
                for(int i=0;i<${Math.log2(innerDim)};++i){
                    if((p & (1<<i))!=0){ k|=(1<<(${Math.log2(innerDim) - 1}-i)); }
                }
                int i=2*k;
                if(c[1]>=${innerDim}){ i=2*(k%${innerDim})+1; }
                int q=c[0]*${frameLength}+i;
                float val=getX((q/${frameLength})*${frameStep}+ q % ${frameLength});
                float cosArg=${2.0 * Math.PI / frameLength}*float(q);
                float mul=0.5-0.5*cos(cosArg);
                setOutput(val*mul);
            }`
        }, [signal], 'float32');

        for (let len = 1; len < innerDim; len *= 2) {
            let prevTensor = currentTensor;
            currentTensor = backend.runWebGLProgram({
                variableNames: ['x'],
                outputShape: [batch, innerDim * 2],
                userCode: `void main(){
                    ivec2 c=getOutputCoords();
                    int b=c[0];
                    int i=c[1];
                    int k=i%${innerDim};
                    int isHigh=(k%${len * 2})/${len};
                    int highSign=(1 - isHigh*2);
                    int baseIndex=k - isHigh*${len};
                    float t=${Math.PI / len}*float(k%${len});
                    float a=cos(t);
                    float bsin=sin(-t);
                    float oddK_re=getX(b, baseIndex+${len});
                    float oddK_im=getX(b, baseIndex+${len + innerDim});
                    if(i<${innerDim}){
                        float evenK_re=getX(b, baseIndex);
                        setOutput(evenK_re + (oddK_re*a - oddK_im*bsin)*float(highSign));
                    } else {
                        float evenK_im=getX(b, baseIndex+${innerDim});
                        setOutput(evenK_im + (oddK_re*bsin + oddK_im*a)*float(highSign));
                    }
                }`
            }, [prevTensor], 'float32');
            backend.disposeIntermediateTensorInfo(prevTensor);
        }

        const real = backend.runWebGLProgram({
            variableNames: ['x'],
            outputShape: [batch, innerDim + 1],
            userCode: `void main(){
                ivec2 c=getOutputCoords();
                int b=c[0];
                int i=c[1];
                int zI=i%${innerDim};
                int conjI=(${innerDim}-i)%${innerDim};
                float Zk0=getX(b,zI);
                float Zk1=getX(b,zI+${innerDim});
                float Zk_conj0=getX(b,conjI);
                float Zk_conj1=-getX(b,conjI+${innerDim});
                float t=${-2.0 * Math.PI}*float(i)/float(${innerDim * 2});
                float diff0=Zk0 - Zk_conj0;
                float diff1=Zk1 - Zk_conj1;
                float result=(Zk0+Zk_conj0 + cos(t)*diff1 + sin(t)*diff0)*0.5;
                setOutput(result);
            }`
        }, [currentTensor], 'float32');
        backend.disposeIntermediateTensorInfo(currentTensor);
        return real;
    }
});

/* ─── INIT ───────────────────────────────────────────────────────────────── */
init();

async function init() {
    await tf.setBackend('webgl');
    tf.serialization.registerClass(MelSpecLayerSimple);

    birdModel = await tf.loadLayersModel(MODEL_PATH, {
        onProgress: p => postMessage({ message: 'load_model', progress: (p * 70) | 0 })
    });

    postMessage({ message: 'warmup', progress: 70 });
    tf.tidy(() => birdModel.predict(tf.zeros([1, WINDOW_SAMPLES])));

    postMessage({ message: 'load_geomodel', progress: 85 });
    try {
        areaModel = await tf.loadGraphModel(AREA_MODEL_PATH);
    } catch (e) {
        console.warn('Geo model failed to load:', e);
    }

    postMessage({ message: 'load_labels', progress: 95 });
    await loadLabels();

    postMessage({ message: 'loaded', progress: 100 });
}

async function loadLabels() {
    const birdsList = (await fetch(LABELS_DIR + '/en_us.txt').then(r => r.text())).split('\n');
    birds = birdsList.map(line => {
        const [sci, com] = line.split('_');
        return { scientificName: sci || line, commonName: com || line, geoscore: 1 };
    });
}

/* ─── MESSAGE HANDLER ───────────────────────────────────────────────────── */
onmessage = async ({ data }) => {
    switch (data.message) {
        case 'predict':      await handlePredict(data); break;
        case 'area-scores':  await handleAreaScores(data); break;
    }
};

/* ─── INFERENCE ─────────────────────────────────────────────────────────── */
async function handlePredict(data) {
    if (!birdModel) return;

    const overlapSec = Math.min(2.5, Math.max(0.0, Math.round((data.overlapSec ?? 1.5) * 2) / 2));
    const overlapSamples = Math.round(overlapSec * SAMPLE_RATE);
    const hopSamples = Math.max(1, WINDOW_SAMPLES - overlapSamples);

    const pcm = data.pcmAudio || new Float32Array(0);
    const total = pcm.length;
    const numFrames = Math.max(1, Math.ceil(Math.max(0, total - WINDOW_SAMPLES) / hopSamples) + 1);

    const framed = new Float32Array(numFrames * WINDOW_SAMPLES);
    for (let f = 0; f < numFrames; f++) {
        const start = f * hopSamples;
        framed.set(pcm.subarray(start, Math.min(start + WINDOW_SAMPLES, total)), f * WINDOW_SAMPLES);
    }

    const audioTensor = tf.tensor2d(framed, [numFrames, WINDOW_SAMPLES]);
    const resTensor = birdModel.predict(audioTensor);
    let predictionList = await resTensor.array();
    resTensor.dispose();
    audioTensor.dispose();

    const sensitivity = parseFloat(data.sensitivity || 1.0);
    if (sensitivity !== 1.0) predictionList = applySensitivity(predictionList, sensitivity);

    lastPredictionList = predictionList;
    lastHopSamples = hopSamples;
    lastNumFrames = numFrames;

    emitPooled(predictionList);
}

function emitPooled(predictionList) {
    const numClasses = predictionList[0]?.length || 0;
    const numFrames = predictionList.length;
    const ALPHA = 5.0;

    const sumsExp = new Float64Array(numClasses);
    for (let f = 0; f < numFrames; f++) {
        const row = predictionList[f];
        for (let i = 0; i < numClasses; i++) sumsExp[i] += Math.exp(ALPHA * row[i]);
    }

    lastMeans = Array.from(sumsExp, s => Math.log(s / numFrames) / ALPHA);

    const pooled = lastMeans.map((m, i) => ({
        index: i,
        scientificName: birds[i]?.scientificName || '',
        commonName: birds[i]?.commonName || '',
        confidence: m,
        geoscore: birds[i]?.geoscore ?? 1
    }));

    postMessage({ message: 'pooled', pooled });
}

function applySensitivity(list, sensitivity) {
    const bias = (sensitivity - 1.0) * 5.0;
    return list.map(row => row.map(p => {
        const pp = Math.max(1e-7, Math.min(1 - 1e-7, p));
        const logit = Math.log(pp / (1 - pp));
        return 1 / (1 + Math.exp(-(logit + bias)));
    }));
}

/* ─── GEO SCORING ────────────────────────────────────────────────────────── */
async function handleAreaScores(data) {
    if (!areaModel) return;
    tf.engine().startScope();
    const startOfYear = new Date(new Date().getFullYear(), 0, 1);
    startOfYear.setDate(startOfYear.getDate() + (1 - (startOfYear.getDay() % 7)));
    const week = Math.round((Date.now() - startOfYear.getTime()) / 604800000) + 1;
    const input = tf.tensor([[data.latitude, data.longitude, week]]);
    const areaScores = await areaModel.predict(input).data();
    tf.engine().endScope();

    for (let i = 0; i < birds.length; i++) birds[i].geoscore = areaScores[i] ?? 1;

    if (lastPredictionList && lastMeans) emitPooled(lastPredictionList);
}
