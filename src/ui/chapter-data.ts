import type { ChapterId } from '../sim/chapters';

export interface Chapter {
  id: ChapterId;
  title: string;
  audio: string;
  duration: number;
  transcript: string;
  condition: string;
}

// Durations and words are taken from the supplied MP3 files and their embedded lyrics.
// Static URLs let Vite bundle the original files and work under a GitHub Pages subpath.
export const CHAPTERS: Chapter[] = [
  { id: 'spark', title: 'The first spark', duration: 48.552,
    audio: new URL('../../Media/The First Spark.mp3', import.meta.url).href,
    condition: 'The beginning of your world',
    transcript: "A young world, a restless ocean, and, in the darkness below, something begins to copy itself. From this small beginning, countless futures are possible. You are this world's god. You can warm its seas, reshape its climate, and carry life to distant shores. But every creature must find its own way to survive." },
  { id: 'shore', title: 'Beyond the shore', duration: 38.448,
    audio: new URL('../../Media/Beyond the shore.mp3', import.meta.url).href,
    condition: 'An animal lineage sustains a population on land',
    transcript: "For countless generations the sea has been home. Now an animal lineage establishes itself on land. Here, bodies must bear their own weight, and water must be conserved. A new chapter begins at the water's edge." },
  { id: 'flight', title: 'Taking flight', duration: 38.712,
    audio: new URL('../../Media/Taking flight.mp3', import.meta.url).href,
    condition: 'An established land animal develops flight',
    transcript: 'For the first time, an animal lifts itself into the air. Below lie familiar dangers. Ahead, new feeding grounds—and distant places to raise its young. The sky becomes a habitat.' },
  { id: 'warmth', title: 'Warmth in the darkness', duration: 30.528,
    audio: new URL('../../Media/warmth in the darkness.mp3', import.meta.url).href,
    condition: 'An advanced, furry, social animal establishes itself on land',
    transcript: 'Fur holds warmth against the night. Milk nourishes the young. A mammal-like lineage has emerged, carrying a costly advantage: the ability to remain active when the world grows cold. Survival takes a new form.' },
  { id: 'mind', title: 'A questioning mind', duration: 42.072,
    audio: new URL('../../Media/a-questioning-mind.mp3', import.meta.url).href,
    condition: 'An established ape-like body plan combines dexterity, sociality and intelligence',
    transcript: 'A hand turns an unfamiliar object. Behind watchful eyes, the world becomes a question. Memory reaches into the past. Imagination reaches beyond what is. From the same matter as sea and stone, a mind begins to wonder. What does it mean to be alive?' },
];
