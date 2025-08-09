export type KeyBinding = {
  left: string[];
  right: string[];
  softDrop: string[];
  hardDrop: string[];
  rotateCW: string[];
  rotateCCW: string[];
  hold: string[];
  pause: string[];
  restart: string[];
};

export type InputState = {
  left: boolean;
  right: boolean;
  softDrop: boolean;
  hardDrop: boolean;
  rotateCW: boolean;
  rotateCCW: boolean;
  hold: boolean;
  pause: boolean;
  restart: boolean;
};

const defaultBindings: KeyBinding = {
  left: ["ArrowLeft"],
  right: ["ArrowRight"],
  softDrop: ["ArrowDown"],
  hardDrop: [" "],
  rotateCW: ["x", "X", "ArrowUp"],
  rotateCCW: ["z", "Z"],
  hold: ["c", "C"],
  pause: ["p", "P"],
  restart: ["r", "R"],
};

export class Input {
  private bindings: KeyBinding;
  private state: InputState;

  constructor(bindings: Partial<KeyBinding> = {}) {
    this.bindings = { ...defaultBindings, ...bindings } as KeyBinding;
    this.state = {
      left: false,
      right: false,
      softDrop: false,
      hardDrop: false,
      rotateCW: false,
      rotateCCW: false,
      hold: false,
      pause: false,
      restart: false,
    };
  }

  attach() {
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
  }

  detach() {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
  }

  consume<K extends keyof InputState>(key: K): boolean {
    const pressed = this.state[key];
    this.state[key] = false;
    return pressed;
  }

  private match(e: KeyboardEvent, list: string[]): boolean {
    return list.includes(e.key);
  }

  private onKeyDown = (e: KeyboardEvent) => {
    let handled = false;
    if (this.match(e, this.bindings.left)) { this.state.left = true; handled = true; }
    if (this.match(e, this.bindings.right)) { this.state.right = true; handled = true; }
    if (this.match(e, this.bindings.softDrop)) { this.state.softDrop = true; handled = true; }
    if (this.match(e, this.bindings.hardDrop)) { this.state.hardDrop = true; handled = true; }
    if (this.match(e, this.bindings.rotateCW)) { this.state.rotateCW = true; handled = true; }
    if (this.match(e, this.bindings.rotateCCW)) { this.state.rotateCCW = true; handled = true; }
    if (this.match(e, this.bindings.hold)) { this.state.hold = true; handled = true; }
    if (this.match(e, this.bindings.pause)) { this.state.pause = true; handled = true; }
    if (this.match(e, this.bindings.restart)) { this.state.restart = true; handled = true; }
    if (handled && !isTypingTarget(e)) {
      e.preventDefault();
    }
  };

  private onKeyUp = (e: KeyboardEvent) => {
    let handled = false;
    if (this.match(e, this.bindings.left)) { this.state.left = false; handled = true; }
    if (this.match(e, this.bindings.right)) { this.state.right = false; handled = true; }
    if (this.match(e, this.bindings.softDrop)) { this.state.softDrop = false; handled = true; }
    if (this.match(e, this.bindings.hardDrop)) { this.state.hardDrop = false; handled = true; }
    if (this.match(e, this.bindings.rotateCW)) { this.state.rotateCW = false; handled = true; }
    if (this.match(e, this.bindings.rotateCCW)) { this.state.rotateCCW = false; handled = true; }
    if (this.match(e, this.bindings.hold)) { this.state.hold = false; handled = true; }
    if (this.match(e, this.bindings.pause)) { this.state.pause = false; handled = true; }
    if (this.match(e, this.bindings.restart)) { this.state.restart = false; handled = true; }
    if (handled && !isTypingTarget(e)) {
      e.preventDefault();
    }
  };
}

function isTypingTarget(e: Event): boolean {
  const t = e.target as HTMLElement | null;
  if (!t) return false;
  const tag = t.tagName?.toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return true;
  // contenteditable elements
  if ((t as HTMLElement).isContentEditable) return true;
  return false;
}
