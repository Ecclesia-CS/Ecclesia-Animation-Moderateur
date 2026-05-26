export interface Segment {
  start: number
  end: number
  speaker: string
  text: string
}

export interface TranscriptLine {
  timestamp: string
  speaker: string
  text: string
}
