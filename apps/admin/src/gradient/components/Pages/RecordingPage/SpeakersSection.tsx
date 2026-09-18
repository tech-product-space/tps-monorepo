"use client";

import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/gradient/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/gradient/components/ui/card";
import { Input } from "@/gradient/components/ui/input";
import { Label } from "@/gradient/components/ui/label";
import { Textarea } from "@/gradient/components/ui/textarea";
import { ImagePickerDialog } from "@/gradient/components/ui/ImagePickerDialog/ImagePickerDialog";
import { resolveStorageUrl } from "@/gradient/lib/storage";

import { RecordingHost, RecordingSpeaker } from "@/gradient/types/recording";

interface Props {
  host: RecordingHost;
  speakers: RecordingSpeaker[];
  onHostChange: (next: RecordingHost) => void;
  onSpeakersChange: (next: RecordingSpeaker[]) => void;
}

const emptySpeaker: RecordingSpeaker = {
  name: "",
  title: "",
  company: "",
  avatar: "",
  bio: "",
  linkedinUrl: "",
  previouslyAt: [],
};

/**
 * Host and speakers are different people and different blocks on the page: the
 * host is the "HOSTED BY" chip at the top, the speakers are the
 * "YOU'LL LEARN FROM" section at the bottom. `speakers[0]` also supplies the
 * name and role on the listing card.
 */
export default function SpeakersSection({
  host,
  speakers,
  onHostChange,
  onSpeakersChange,
}: Props) {
  const setSpeaker = (index: number, next: RecordingSpeaker) => {
    const copy = [...speakers];
    copy[index] = next;
    onSpeakersChange(copy);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>People</CardTitle>
      </CardHeader>
      <CardContent className="space-y-8">
        <div className="space-y-3">
          <Label>Host</Label>
          <p className="text-xs text-muted-foreground">
            The “Hosted by” line above the title. Usually whoever ran the
            session, not the speaker.
          </p>
          <div className="grid gap-3 md:grid-cols-2">
            <Input
              value={host?.name ?? ""}
              placeholder="Akhil Yash Tiwari"
              onChange={(e) => onHostChange({ ...host, name: e.target.value })}
            />
            <Input
              value={host?.linkedinUrl ?? ""}
              placeholder="LinkedIn URL (optional)"
              onChange={(e) =>
                onHostChange({ ...host, linkedinUrl: e.target.value })
              }
            />
          </div>

          <div className="flex items-center gap-3">
            <div className="flex flex-1 items-center gap-2">
              <Input value={host?.avatar ?? ""} placeholder="Photo key" readOnly />
              <ImagePickerDialog
                onSelect={(key) => onHostChange({ ...host, avatar: key })}
              />
            </div>
            {host?.avatar && (
              <img
                src={resolveStorageUrl(host.avatar)}
                alt={host.name ?? "Host"}
                className="h-12 w-12 rounded-full object-cover"
              />
            )}
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label>Speakers</Label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onSpeakersChange([...speakers, { ...emptySpeaker }])}
            >
              <Plus className="mr-1 h-3 w-3" />
              Add speaker
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            The first speaker’s name and role also appear on the listing card.
          </p>

          {speakers.length === 0 ? (
            <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
              No speakers yet. The card will show no name until you add one.
            </p>
          ) : (
            speakers.map((speaker, index) => (
              <div key={index} className="space-y-3 rounded-md border p-4">
                <div className="flex items-start justify-between">
                  <span className="text-sm font-medium">
                    Speaker {index + 1}
                    {index === 0 && (
                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                        shown on the card
                      </span>
                    )}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() =>
                      onSpeakersChange(speakers.filter((_, i) => i !== index))
                    }
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>

                <div className="grid gap-3 md:grid-cols-3">
                  <Input
                    value={speaker.name}
                    placeholder="Ashish Gambhir"
                    onChange={(e) =>
                      setSpeaker(index, { ...speaker, name: e.target.value })
                    }
                  />
                  <Input
                    value={speaker.title ?? ""}
                    placeholder="Engineering Lead"
                    onChange={(e) =>
                      setSpeaker(index, { ...speaker, title: e.target.value })
                    }
                  />
                  <Input
                    value={speaker.company ?? ""}
                    placeholder="Winzo"
                    onChange={(e) =>
                      setSpeaker(index, { ...speaker, company: e.target.value })
                    }
                  />
                </div>

                <Textarea
                  rows={3}
                  value={speaker.bio ?? ""}
                  placeholder="Short bio, shown under the speaker's name."
                  onChange={(e) =>
                    setSpeaker(index, { ...speaker, bio: e.target.value })
                  }
                />

                <div className="grid gap-3 md:grid-cols-2">
                  <Input
                    value={speaker.linkedinUrl ?? ""}
                    placeholder="LinkedIn URL"
                    onChange={(e) =>
                      setSpeaker(index, {
                        ...speaker,
                        linkedinUrl: e.target.value,
                      })
                    }
                  />
                  <div className="flex items-center gap-2">
                    <Input
                      value={speaker.avatar ?? ""}
                      placeholder="Photo key"
                      readOnly
                    />
                    <ImagePickerDialog
                      onSelect={(key) =>
                        setSpeaker(index, { ...speaker, avatar: key })
                      }
                    />
                  </div>
                </div>

                {speaker.avatar && (
                  <img
                    src={resolveStorageUrl(speaker.avatar)}
                    alt={speaker.name}
                    className="h-16 w-16 rounded-full object-cover"
                  />
                )}

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">Previously at</Label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setSpeaker(index, {
                          ...speaker,
                          previouslyAt: [
                            ...(speaker.previouslyAt ?? []),
                            { name: "", logo: "" },
                          ],
                        })
                      }
                    >
                      <Plus className="mr-1 h-3 w-3" />
                      Add logo
                    </Button>
                  </div>

                  {(speaker.previouslyAt ?? []).map((company, logoIndex) => (
                    <div key={logoIndex} className="flex items-center gap-2">
                      <Input
                        className="max-w-[200px]"
                        value={company.name}
                        placeholder="BharatPe"
                        onChange={(e) => {
                          const next = [...(speaker.previouslyAt ?? [])];
                          next[logoIndex] = {
                            ...company,
                            name: e.target.value,
                          };
                          setSpeaker(index, { ...speaker, previouslyAt: next });
                        }}
                      />
                      <Input value={company.logo ?? ""} placeholder="Logo key" readOnly />
                      <ImagePickerDialog
                        onSelect={(key) => {
                          const next = [...(speaker.previouslyAt ?? [])];
                          next[logoIndex] = { ...company, logo: key };
                          setSpeaker(index, { ...speaker, previouslyAt: next });
                        }}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() =>
                          setSpeaker(index, {
                            ...speaker,
                            previouslyAt: (speaker.previouslyAt ?? []).filter(
                              (_, i) => i !== logoIndex,
                            ),
                          })
                        }
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
