"use client";

import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import { RecordingHost, RecordingSpeaker } from "@/types/recording";
import ImageField from "./ImageField";

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
 * host is the "Hosted by" chip at the top, the speakers are the "You'll learn
 * from" section further down. `speakers[0]` also supplies the name and role on
 * the listing card.
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
    <div className="rounded-lg border border-gray-200 bg-white p-5">
      <h2 className="mb-4 text-base font-semibold text-gray-900">People</h2>

      <div className="space-y-8">
        <div className="space-y-3">
          <Label>Host</Label>
          <p className="text-xs text-gray-500">
            The “Hosted by” line above the title. Usually whoever ran the
            session, not the speaker.
          </p>
          <div className="grid gap-3 md:grid-cols-2">
            <Input
              value={host?.name ?? ""}
              placeholder="Host name"
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
          <ImageField
            value={host?.avatar}
            onChange={(url) => onHostChange({ ...host, avatar: url })}
            label="Upload photo"
          />
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label>Speakers</Label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                onSpeakersChange([...speakers, { ...emptySpeaker }])
              }
            >
              <Plus className="mr-1 h-3 w-3" />
              Add speaker
            </Button>
          </div>
          <p className="text-xs text-gray-500">
            The first speaker’s name and role also appear on the listing card.
          </p>

          {speakers.length === 0 ? (
            <p className="rounded-md border border-dashed border-gray-300 p-4 text-sm text-gray-500">
              No speakers yet. The card will show no name until you add one.
            </p>
          ) : (
            speakers.map((speaker, index) => (
              <div
                key={index}
                className="space-y-3 rounded-md border border-gray-200 p-4"
              >
                <div className="flex items-start justify-between">
                  <span className="text-sm font-medium text-gray-900">
                    Speaker {index + 1}
                    {index === 0 && (
                      <span className="ml-2 text-xs font-normal text-gray-500">
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
                    <Trash2 className="h-4 w-4 text-red-600" />
                  </Button>
                </div>

                <div className="grid gap-3 md:grid-cols-3">
                  <Input
                    value={speaker.name}
                    placeholder="Name"
                    onChange={(e) =>
                      setSpeaker(index, { ...speaker, name: e.target.value })
                    }
                  />
                  <Input
                    value={speaker.title ?? ""}
                    placeholder="Title — Principal PM"
                    onChange={(e) =>
                      setSpeaker(index, { ...speaker, title: e.target.value })
                    }
                  />
                  <Input
                    value={speaker.company ?? ""}
                    placeholder="Company"
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

                <div className="grid items-center gap-3 md:grid-cols-2">
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
                  <ImageField
                    value={speaker.avatar}
                    onChange={(url) =>
                      setSpeaker(index, { ...speaker, avatar: url })
                    }
                    label="Upload photo"
                  />
                </div>

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
                        className="max-w-[220px]"
                        value={company.name}
                        placeholder="Company name"
                        onChange={(e) => {
                          const next = [...(speaker.previouslyAt ?? [])];
                          next[logoIndex] = {
                            ...company,
                            name: e.target.value,
                          };
                          setSpeaker(index, { ...speaker, previouslyAt: next });
                        }}
                      />
                      <ImageField
                        value={company.logo}
                        shape="square"
                        label="Upload logo"
                        onChange={(url) => {
                          const next = [...(speaker.previouslyAt ?? [])];
                          next[logoIndex] = { ...company, logo: url };
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
                              (_, i) => i !== logoIndex
                            ),
                          })
                        }
                      >
                        <Trash2 className="h-4 w-4 text-red-600" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
