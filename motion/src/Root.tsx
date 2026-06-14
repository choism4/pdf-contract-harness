import { Composition } from "remotion";
import { HeroAnim, FPS, DURATION } from "./HeroAnim";

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="HeroAnim"
      component={HeroAnim}
      durationInFrames={DURATION}
      fps={FPS}
      width={1280}
      height={720}
    />
  );
};
