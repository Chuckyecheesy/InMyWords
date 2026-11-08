import React from "react";
import { Composition } from "remotion";
import { InMyWordsDemo, TOTAL_FRAMES } from "./InMyWordsDemo";

export const RemotionRoot: React.FC = () => (
  <Composition
    id="InMyWordsDemo"
    component={InMyWordsDemo}
    durationInFrames={TOTAL_FRAMES}
    fps={30}
    width={1920}
    height={1080}
  />
);
