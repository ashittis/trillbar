import { createBrowserRouter } from "react-router";
import { ProjectUpload } from "./components/ProjectUpload";
import { Projects } from "./components/Projects";
import { VoiceLab } from "./components/VoiceLab";
import { DubStudio } from "./components/DubStudio";

export const router = createBrowserRouter([
  {
    path: "/",
    Component: ProjectUpload,
  },
  {
    path: "/projects",
    Component: Projects,
  },
  {
    path: "/voice-lab",
    Component: VoiceLab,
  },
  {
    path: "/dub-studio",
    Component: DubStudio,
  },
]);
