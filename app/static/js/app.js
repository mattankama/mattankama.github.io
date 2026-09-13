/**
 * Rattlesnake — Shared utilities
 * Dark-mode-only — no theme switching needed.
 */

/**
 * Fetch JSON wrapper with error handling.
 * @param {string} url
 * @param {RequestInit} options
 * @returns {Promise<any>}
 */
async function fetchJSON(url, options = {}) {
    const defaults = {
        headers: { "Content-Type": "application/json" },
    };
    const merged = { ...defaults, ...options };
    if (options.headers) {
        merged.headers = { ...defaults.headers, ...options.headers };
    }

    const response = await fetch(url, merged);

    if (response.status === 204) {
        return null;
    }

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.error || `Request failed: ${response.status}`);
    }

    return data;
}

/**
 * Custom dropdown component — replaces native <select>.
 * Usage:
 *   const dropdown = new CustomSelect(container, {
 *       placeholder: 'Select machine',
 *       options: [{ value: '1', label: 'Machine A' }, ...],
 *       selectedValue: '1',
 *       onChange: (value) => { ... },
 *   });
 */
class CustomSelect {
    /**
     * @param {HTMLElement} container — the wrapper element to mount into
     * @param {Object} config
     * @param {string} config.placeholder
     * @param {Array<{value: string, label: string, isAction?: boolean}>} config.options
     * @param {string} [config.selectedValue]
     * @param {string} [config.id] — unique id for the component
     * @param {function(string): void} config.onChange
     */
    constructor(container, config) {
        this.container = container;
        this.config = config;
        this.isOpen = false;
        this.selectedValue = config.selectedValue || "";
        this.options = config.options || [];
        this.render();
        this._bindOutsideClick();
    }

    render() {
        this.container.innerHTML = "";
        this.container.classList.add("custom-select");
        if (this.config.id) {
            this.container.id = this.config.id;
        }

        // Trigger button
        const trigger = document.createElement("div");
        trigger.className = "custom-select-trigger";
        trigger.setAttribute("role", "combobox");
        trigger.setAttribute("tabindex", "0");

        const selectedOption = this.options.find(
            (o) => o.value === this.selectedValue && !o.isAction
        );
        const labelSpan = document.createElement("span");
        if (selectedOption) {
            labelSpan.textContent = selectedOption.label;
        } else {
            labelSpan.textContent = this.config.placeholder || "Select...";
            labelSpan.className = "placeholder";
        }

        const arrow = document.createElement("span");
        arrow.className = "arrow";

        trigger.appendChild(labelSpan);
        trigger.appendChild(arrow);

        trigger.addEventListener("click", (e) => {
            e.stopPropagation();
            this.toggle();
        });

        trigger.addEventListener("keydown", (e) => {
            if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                this.toggle();
            } else if (e.key === "Escape" && this.isOpen) {
                this.close();
            }
        });

        this.triggerEl = trigger;

        // Options panel
        const optionsPanel = document.createElement("div");
        optionsPanel.className = "custom-select-options";

        for (const opt of this.options) {
            const item = document.createElement("div");
            item.className = "custom-select-option";
            if (opt.isAction) {
                item.classList.add("action-option");
            }
            if (opt.value === this.selectedValue && !opt.isAction) {
                item.classList.add("selected");
            }
            item.textContent = opt.label;
            item.dataset.value = opt.value;

            item.addEventListener("click", (e) => {
                e.stopPropagation();
                this.select(opt.value);
            });

            optionsPanel.appendChild(item);
        }

        this.optionsPanelEl = optionsPanel;

        this.container.appendChild(trigger);
        this.container.appendChild(optionsPanel);
    }

    toggle() {
        if (this.isOpen) {
            this.close();
        } else {
            this.open();
        }
    }

    open() {
        // Close all other open dropdowns first
        document.querySelectorAll(".custom-select.open").forEach((el) => {
            if (el !== this.container) {
                el.classList.remove("open");
            }
        });
        this.isOpen = true;
        this.container.classList.add("open");
    }

    close() {
        this.isOpen = false;
        this.container.classList.remove("open");
    }

    select(value) {
        this.selectedValue = value;
        this.close();

        // Update trigger label
        const selectedOption = this.options.find(
            (o) => o.value === value && !o.isAction
        );
        const labelSpan = this.triggerEl.querySelector("span:first-child");
        if (selectedOption) {
            labelSpan.textContent = selectedOption.label;
            labelSpan.className = "";
        } else {
            labelSpan.textContent = this.config.placeholder || "Select...";
            labelSpan.className = "placeholder";
        }

        // Update selected styling
        this.optionsPanelEl
            .querySelectorAll(".custom-select-option")
            .forEach((el) => {
                el.classList.toggle(
                    "selected",
                    el.dataset.value === value && !el.classList.contains("action-option")
                );
            });

        if (this.config.onChange) {
            this.config.onChange(value);
        }
    }

    /** Set value without triggering onChange */
    setValue(value) {
        this.selectedValue = value;
        const selectedOption = this.options.find(
            (o) => o.value === value && !o.isAction
        );
        const labelSpan = this.triggerEl.querySelector("span:first-child");
        if (selectedOption) {
            labelSpan.textContent = selectedOption.label;
            labelSpan.className = "";
        } else {
            labelSpan.textContent = this.config.placeholder || "Select...";
            labelSpan.className = "placeholder";
        }
    }

    /** Add a new option before the last (action) item */
    addOption(value, label) {
        const newOpt = { value, label };
        // Insert before any action options at the end
        const actionIdx = this.options.findIndex((o) => o.isAction);
        if (actionIdx >= 0) {
            this.options.splice(actionIdx, 0, newOpt);
        } else {
            this.options.push(newOpt);
        }
        this.render();
    }

    _bindOutsideClick() {
        document.addEventListener("click", () => {
            if (this.isOpen) {
                this.close();
            }
        });
    }
}
