/**
 * Q1–Q4 question videos (Julius Caesar frames).
 * The interview player uses a same-origin proxy so the recorder can paint
 * question frames onto the canvas (CDN videos cannot be drawn cross-origin).
 */
export const SPACES_QUESTION_VIDEOS: Record<number, string> = {
  1: "https://scivision.sgp1.cdn.digitaloceanspaces.com/doctor_live_podcast/questions/question1.mp4",
  2: "https://scivision.sgp1.cdn.digitaloceanspaces.com/doctor_live_podcast/questions/question2.mp4",
  3: "https://scivision.sgp1.cdn.digitaloceanspaces.com/doctor_live_podcast/questions/question3.mp4",
  4: "https://scivision.sgp1.cdn.digitaloceanspaces.com/doctor_live_podcast/questions/question4.mp4",
};

export function getQuestionVideoRemoteUrl(order: number) {
  return SPACES_QUESTION_VIDEOS[order] ?? null;
}

export function getQuestionVideoSrc(order: number) {
  if (SPACES_QUESTION_VIDEOS[order]) {
    return `/api/question-videos/${order}`;
  }
  return `/Videos/question${order}.mp4`;
}
