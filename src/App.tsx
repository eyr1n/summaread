import {
  Delete,
  FileOpen,
  ReadMore,
  RecordVoiceOver,
  Settings,
  Stop,
} from "@mui/icons-material";
import {
  Backdrop,
  Box,
  Button,
  Card,
  CardActions,
  CardContent,
  CircularProgress,
  Container,
  Dialog,
  DialogContent,
  DialogTitle,
  Grid,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { open } from "@tauri-apps/api/dialog";
import { invoke } from "@tauri-apps/api/tauri";
import { useEffect, useRef, useState } from "react";
import { useLocalStorage } from "react-use";

interface SummarizedPaper {
  title: string;
  body: string;
}

export function App() {
  const [apiKey, setApiKey] = useLocalStorage("api_key", "");
  const [prompt, setPrompt] = useLocalStorage(
    "prompt",
    "100字程度の日本語(口語体)に要約して下さい．"
  );
  const [summarizedPapers, setSummarizedPapers, removeSummarizedPapers] =
    useLocalStorage<SummarizedPaper[]>("summarized_papers", []);

  const [url, setUrl] = useState("");
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const summarizeFromLocal = async () => {
    const path = await open({
      multiple: false,
      filters: [
        {
          name: "PDF",
          extensions: ["pdf"],
        },
      ],
    });

    setIsSummarizing(true);
    const json = JSON.parse(
      await invoke("summarize_from_local", {
        apiKey,
        path,
        prompt,
      })
    );
    setSummarizedPapers([...(summarizedPapers ?? []), json]);
    setIsSummarizing(false);
  };

  const summarizeFromUrl = async () => {
    setIsSummarizing(true);
    const json = JSON.parse(
      await invoke("summarize_from_url", {
        apiKey,
        url,
        prompt,
      })
    );
    setSummarizedPapers([...(summarizedPapers ?? []), json]);
    setIsSummarizing(false);
  };

  const ttsHost = "http://localhost:50021";
  const [speakerId, setSpeakerId] = useLocalStorage("speaker_id", "0");

  useEffect(() => {
    (async () => {
      /* await fetch(`${ttsHost}/host/0`, { method: "POST" });
      await fetch(`${ttsHost}/voice-preset/0`, { method: "POST" });
      await fetch(`${ttsHost}/master-control`, {
        method: "POST",
        body: masterControl,
      }); */
    })();
  }, [ttsHost, speakerId]);

  const startTts = async () => {
    if (!summarizedPapers) return;
    try {
      await tts("要約の読み上げを開始します．");
      for (let i = 0; i < summarizedPapers.length; ++i) {
        await tts(
          `${i + 1}件目，タイトルは${
            summarizedPapers[i].title
              ? `「${summarizedPapers[i].title}」です．`
              : "ありません．"
          }`
        );
        await tts(summarizedPapers[i].body);
      }
      await tts(`以上，${summarizedPapers.length}件の要約を読み上げました．`);
    } catch (_) {
      console.log("再生停止");
    }
  };

  const stopTts = useRef(() => {});
  const isTtsStopped = useRef(false);

  const [speed, setSpeed] = useLocalStorage("speed", 1);
  const [pitch, setPitch] = useLocalStorage("pitch", 0);
  const [intonation, setIntonation] = useLocalStorage("intonation", 1);

  const tts = async (text: string) => {
    const audioQuery = await fetch(
      `${ttsHost}/audio_query?${new URLSearchParams({
        text: text,
        speaker: speakerId ?? "0",
      })}`,
      {
        method: "POST",
      }
    ).then((res) => res.json());
    audioQuery.speedScale = speed;
    audioQuery.pitchScale = pitch;
    audioQuery.intonationScale = intonation;

    const blob = await fetch(
      `${ttsHost}/synthesis?${new URLSearchParams({
        speaker: speakerId ?? "0",
      })}`,
      {
        method: "POST",
        body: JSON.stringify(audioQuery),
        headers: {
          "Content-Type": "application/json",
        },
      }
    ).then((res) => res.blob());
    const blobUrl = URL.createObjectURL(blob);
    const audio = new Audio(blobUrl);
    stopTts.current = () => {
      isTtsStopped.current = true;
      audio.pause();
    };
    await new Promise((resolve, reject) => {
      audio.addEventListener("pause", () => {
        if (isTtsStopped.current) {
          isTtsStopped.current = false;
          reject(new Error("stopped"));
        }
      });
      audio.addEventListener("ended", resolve);
      audio.play();
    });
  };

  return (
    <Container sx={{ mt: 2, mb: 2 }}>
      <Backdrop
        sx={{ color: "#fff", zIndex: (theme) => theme.zIndex.drawer + 1 }}
        open={isSummarizing}
      >
        <CircularProgress color="inherit" />
      </Backdrop>

      <Dialog open={isSettingsOpen} onClose={() => setIsSettingsOpen(false)}>
        <DialogTitle>Settings</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 2, mb: 2 }}>
            <TextField
              label="API Key"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
            <Button
              variant="contained"
              color="error"
              startIcon={<Delete />}
              onClick={removeSummarizedPapers}
            >
              Clear all summarized papers
            </Button>
          </Stack>
        </DialogContent>
      </Dialog>

      <Grid container spacing={2}>
        <Grid item xs={8}>
          <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 2 }}>
            <TextField
              label="URL"
              fullWidth
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
            <Box>
              <Button
                variant="contained"
                color="success"
                startIcon={<ReadMore />}
                onClick={summarizeFromUrl}
                disabled={url === ""}
              >
                Summarize
              </Button>
            </Box>
            <Typography>or</Typography>
            <Box>
              <Button
                variant="contained"
                startIcon={<FileOpen />}
                onClick={summarizeFromLocal}
              >
                Open
              </Button>
            </Box>
          </Stack>
          <Stack spacing={2}>
            {summarizedPapers?.map((paper, i) => (
              <Card key={i}>
                <CardContent>
                  <Typography variant="h6">{paper.title}</Typography>
                  <Typography variant="body2">{paper.body}</Typography>
                </CardContent>
                <CardActions>
                  <Button
                    color="error"
                    size="small"
                    startIcon={<Delete />}
                    onClick={() => {
                      setSummarizedPapers([
                        ...summarizedPapers.filter((_, j) => j !== i),
                      ]);
                    }}
                  >
                    Remove
                  </Button>
                </CardActions>
              </Card>
            ))}
          </Stack>
        </Grid>
        <Grid item xs={4}>
          <Stack spacing={2}>
            <TextField
              label="Prompt"
              multiline
              rows={4}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
            />
            <TextField
              label="Speaker ID"
              value={speakerId}
              type="number"
              onChange={(e) => setSpeakerId(e.target.value)}
            />
            <TextField
              label="Speed"
              value={speed}
              type="number"
              onChange={(e) => setSpeed(parseFloat(e.target.value))}
            />
            <TextField
              label="Pitch"
              value={pitch}
              type="number"
              onChange={(e) => setPitch(parseFloat(e.target.value))}
            />
            <TextField
              label="Intonation"
              value={intonation}
              type="number"
              onChange={(e) => setIntonation(parseFloat(e.target.value))}
            />
            <Stack direction="row" spacing={1}>
              <Button
                variant="contained"
                color="success"
                startIcon={<RecordVoiceOver />}
                onClick={startTts}
              >
                TTS
              </Button>
              <Button
                variant="contained"
                color="error"
                onClick={() => stopTts.current()}
              >
                <Stop />
              </Button>
              <Button
                variant="contained"
                color="secondary"
                onClick={() => setIsSettingsOpen(true)}
              >
                <Settings />
              </Button>
            </Stack>
          </Stack>
        </Grid>
      </Grid>
    </Container>
  );
}
