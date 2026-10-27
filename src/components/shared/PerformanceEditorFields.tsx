import React from "react";
import { Star, Eye } from "lucide-react";
import { COLORS, displayStack, fontStack, monoStack } from "../../constants/design";
import { AttributeSlider } from "../ui";
import {
  PERFORMANCE_SKILLS,
  PARENT_FEEDBACK_MAX_LENGTH,
  formatRating,
  ratingFromSkills,
  skillLabel,
  skillsForStars,
  type SkillKey,
  type SkillValues,
} from "../../utils/performanceSkills";

interface PerformanceEditorFieldsProps {
  ratingLabel: string;
  playerName: string;
  positionName?: string | null;
  skills: SkillValues;
  onSkillsChange: (skills: SkillValues) => void;
  notes: string;
  onNotesChange: (notes: string) => void;
  parentFeedback: string;
  onParentFeedbackChange: (feedback: string) => void;
  disabled?: boolean;
}

const STAR_OPTIONS = [1, 2, 3, 4, 5];

const sectionLabelStyle: React.CSSProperties = {
  fontFamily: monoStack,
  fontSize: 10,
  letterSpacing: "0.18em",
  color: COLORS.mute,
  fontWeight: 600,
  textTransform: "uppercase",
  marginBottom: 10,
};

export const PerformanceEditorFields: React.FC<PerformanceEditorFieldsProps> = ({
  ratingLabel,
  playerName,
  positionName,
  skills,
  onSkillsChange,
  notes,
  onNotesChange,
  parentFeedback,
  onParentFeedbackChange,
  disabled,
}) => {
  const rating = ratingFromSkills(skills);
  const lockedStyle: React.CSSProperties = { opacity: disabled ? 0.5 : 1, pointerEvents: disabled ? "none" : undefined };
  const setSkill = (key: SkillKey, value: number) => onSkillsChange({ ...skills, [key]: value });

  return (
    <>
      <div>
        <div style={sectionLabelStyle}>{ratingLabel}</div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", ...lockedStyle }}>
          {STAR_OPTIONS.map((stars) => {
            const isFull = rating >= stars;
            const isHalf = !isFull && rating >= stars - 0.5;
            const isLit = isFull || isHalf;
            return (
              <button
                key={stars}
                onClick={() => onSkillsChange(skillsForStars(stars))}
                style={{ width: 42, height: 42, borderRadius: 12, border: 0, background: isFull ? COLORS.yellow : isHalf ? `linear-gradient(90deg, ${COLORS.yellow} 50%, #F3F0E5 50%)` : "#F3F0E5", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
              >
                <Star size={19} color={isLit ? COLORS.navy : COLORS.mute} fill={isLit ? COLORS.navy : "none"} strokeWidth={2} />
              </button>
            );
          })}
          <div style={{ marginLeft: "auto", fontFamily: displayStack, fontWeight: 800, fontSize: 28, color: COLORS.navy }}>{formatRating(rating)}</div>
        </div>
        <div style={{ fontFamily: monoStack, fontSize: 9.5, color: COLORS.mute, letterSpacing: "0.1em", marginTop: 6 }}>
          Rating = average of {PERFORMANCE_SKILLS.length} skills · tapping a star resets sliders
        </div>
      </div>

      <div>
        <div style={{ ...sectionLabelStyle, marginBottom: 12 }}>Attributes · {PERFORMANCE_SKILLS.length} Skills</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14, ...lockedStyle }}>
          {PERFORMANCE_SKILLS.map((skill) => (
            <AttributeSlider
              key={skill.key}
              label={skillLabel(skill, positionName)}
              description={skill.description}
              value={skills[skill.key]}
              onChange={(value) => setSkill(skill.key, value)}
            />
          ))}
        </div>
      </div>

      <div>
        <div style={sectionLabelStyle}>Coach Notes · Internal</div>
        <div style={{ background: COLORS.cream, border: `1px solid ${COLORS.line}`, borderRadius: 14, padding: 12 }}>
          <textarea
            value={notes}
            onChange={(e) => onNotesChange(e.target.value)}
            disabled={disabled}
            placeholder="Private notes for coaching staff…"
            style={{ width: "100%", minHeight: 70, border: 0, outline: 0, fontFamily: fontStack, fontSize: 13, color: COLORS.ink, lineHeight: 1.55, resize: "vertical", background: "transparent" }}
          />
        </div>
      </div>

      <div style={{ background: COLORS.yellowSoft, border: `1px solid ${COLORS.yellow}`, borderRadius: 16, padding: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
          <Eye size={13} color={COLORS.navy} strokeWidth={2} />
          <span style={{ flex: 1, fontFamily: monoStack, fontSize: 10, letterSpacing: "0.18em", color: COLORS.navy, fontWeight: 700, textTransform: "uppercase" }}>
            Feedback for Parent
          </span>
          <span style={{ fontFamily: monoStack, fontSize: 10, color: COLORS.mute, letterSpacing: "0.06em" }}>
            {parentFeedback.length} / {PARENT_FEEDBACK_MAX_LENGTH}
          </span>
        </div>
        <textarea
          value={parentFeedback}
          onChange={(e) => onParentFeedbackChange(e.target.value)}
          disabled={disabled}
          maxLength={PARENT_FEEDBACK_MAX_LENGTH}
          placeholder={`Progress and next steps for ${playerName}'s parent…`}
          style={{ width: "100%", minHeight: 110, border: `1px solid ${COLORS.line}`, borderRadius: 12, outline: 0, padding: "10px 12px", boxSizing: "border-box", fontFamily: fontStack, fontSize: 13.5, color: COLORS.ink, lineHeight: 1.55, resize: "vertical", background: "#fff" }}
        />
      </div>
    </>
  );
};
