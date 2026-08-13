/**
 * Q1–Q4 question videos (Julius Caesar frames).
 * Production uses Spaces CDN; local fallback is public/Videos/questionN.mp4
 */
const SPACES_QUESTION_VIDEOS: Record<number, string> = {
  1: "https://scivision.sgp1.cdn.digitaloceanspaces.com/doctor_live_podcast/questions/question1.mp4",
  2: "https://scivision.sgp1.cdn.digitaloceanspaces.com/doctor_live_podcast/questions/question2.mp4",
  3: "https://scivision.sgp1.cdn.digitaloceanspaces.com/doctor_live_podcast/questions/question3.mp4",
  4: "https://scivision.sgp1.cdn.digitaloceanspaces.com/doctor_live_podcast/questions/question4.mp4",
};

export function getQuestionVideoSrc(order: number) {
  return SPACES_QUESTION_VIDEOS[order] ?? `/Videos/question${order}.mp4`;
}
