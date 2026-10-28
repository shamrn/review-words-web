class TTS {
  constructor() {
    this.synth = window.speechSynthesis || null;
    this.voices = [];
    this.selectedVoice = null;
    this.rate = 0.95;
    this.pitch = 1.0;
    this.autoPlay = false;

    if (this.synth) {
      this.loadVoices();
      if (this.synth.onvoiceschanged !== undefined) {
        this.synth.onvoiceschanged = () => this.loadVoices();
      }
    }
  }

  loadVoices() {
    if (!this.synth) return;
    this.voices = this.synth.getVoices().filter((v) => v.lang.startsWith('en'));

    if (!this.selectedVoice && this.voices.length > 0) {
      const preferred = this.voices.find(
        (v) =>
          v.name.includes('Samantha') ||
          v.name.includes('Daniel') ||
          v.name.includes('Google US English') ||
          v.name.includes('Natural') ||
          v.default
      );
      this.selectedVoice = preferred || this.voices[0];
    }
  }

  getEnglishVoices() {
    return this.voices;
  }

  setVoiceByName(name) {
    const v = this.voices.find((voice) => voice.name === name);
    if (v) this.selectedVoice = v;
  }

  setRate(val) {
    this.rate = Math.max(0.5, Math.min(1.5, Number(val) || 1.0));
  }

  speak(text) {
    if (!this.synth || !text) return;

    this.synth.cancel();

    const cleanText = text.trim();
    if (!cleanText) return;

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = 'en-US';
    if (this.selectedVoice) {
      utterance.voice = this.selectedVoice;
    }
    utterance.rate = this.rate;
    utterance.pitch = this.pitch;

    this.synth.speak(utterance);
  }

  stop() {
    if (this.synth) {
      this.synth.cancel();
    }
  }
}

export const tts = new TTS();
