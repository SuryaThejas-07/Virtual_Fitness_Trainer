import bicepsCurl from "@/assets/exercise-biceps-curl.png";
import squat from "@/assets/exercise-squat.png";
import pushup from "@/assets/exercise-pushup.png";
import lunge from "@/assets/exercise-lunge.png";
import jumpingJack from "@/assets/exercise-jumping-jack.png";
import plank from "@/assets/exercise-plank.png";

const imageMap: Record<string, string> = {
  "Biceps Curl": bicepsCurl,
  "Squat": squat,
  "Pushup": pushup,
  "Lunge": lunge,
  "Jumping Jack": jumpingJack,
  "Plank": plank,
};

export default function ExerciseAnimation({ exercise }: { exercise: string }) {
  const src = imageMap[exercise];

  if (!src) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-secondary/30">
        <p className="text-muted-foreground">No image available</p>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex items-center justify-center bg-white p-4">
      <img
        src={src}
        alt={`${exercise} demonstration`}
        className="max-w-full max-h-full object-contain"
      />
    </div>
  );
}
