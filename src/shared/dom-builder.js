/**
 * DOM Builder
 * Helper minimalista para construir elementos sem HTML literals.
 */

export function el(tag, options = {}) {
    const {
        id,
        className,
        classes,
        attrs,
        style,
        text,
        html,
        children,
        on,
        dataset
    } = options;

    const element = document.createElement(tag);

    if (id) element.id = id;
    if (className) element.className = className;
    if (classes) element.classList.add(...classes.filter(Boolean));
    if (attrs) {
        Object.entries(attrs).forEach(([key, value]) => {
            if (value !== undefined && value !== null) {
                element.setAttribute(key, String(value));
            }
        });
    }
    if (style) {
        Object.entries(style).forEach(([key, value]) => {
            if (value !== undefined && value !== null) {
                element.style[key] = value;
            }
        });
    }
    if (dataset) {
        Object.entries(dataset).forEach(([key, value]) => {
            element.dataset[key] = value;
        });
    }
    if (text !== undefined) element.textContent = text;
    if (html !== undefined) element.innerHTML = html;
    if (children) {
        children.forEach((child) => {
            if (child == null) return;
            if (typeof child === 'string') {
                element.appendChild(document.createTextNode(child));
            } else if (child instanceof Node) {
                element.appendChild(child);
            } else if (Array.isArray(child)) {
                child.forEach((c) => {
                    if (c == null) return;
                    element.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
                });
            }
        });
    }
    if (on) {
        Object.entries(on).forEach(([event, handler]) => {
            element.addEventListener(event, handler);
        });
    }

    return element;
}

export function text(value) {
    return document.createTextNode(String(value));
}
