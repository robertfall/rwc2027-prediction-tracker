/* @ds-bundle: {"format":4,"namespace":"SunlitMatchdayDesignSystem_347d00","components":[{"name":"Button","sourcePath":"components/actions/Button.jsx"},{"name":"IconButton","sourcePath":"components/actions/IconButton.jsx"},{"name":"Icon","sourcePath":"components/brand/Icon.jsx"},{"name":"Wordmark","sourcePath":"components/brand/Wordmark.jsx"},{"name":"Badge","sourcePath":"components/display/Badge.jsx"},{"name":"Card","sourcePath":"components/display/Card.jsx"},{"name":"Tag","sourcePath":"components/display/Tag.jsx"},{"name":"Dialog","sourcePath":"components/feedback/Dialog.jsx"},{"name":"Notice","sourcePath":"components/feedback/Notice.jsx"},{"name":"Toast","sourcePath":"components/feedback/Toast.jsx"},{"name":"Tooltip","sourcePath":"components/feedback/Tooltip.jsx"},{"name":"Checkbox","sourcePath":"components/forms/Checkbox.jsx"},{"name":"Input","sourcePath":"components/forms/Input.jsx"},{"name":"Radio","sourcePath":"components/forms/Radio.jsx"},{"name":"ScoreStepper","sourcePath":"components/forms/ScoreStepper.jsx"},{"name":"Select","sourcePath":"components/forms/Select.jsx"},{"name":"Switch","sourcePath":"components/forms/Switch.jsx"},{"name":"FixtureCard","sourcePath":"components/matchday/FixtureCard.jsx"},{"name":"FixtureRow","sourcePath":"components/matchday/FixtureRow.jsx"},{"name":"LeaderboardTable","sourcePath":"components/matchday/LeaderboardTable.jsx"},{"name":"Tabs","sourcePath":"components/navigation/Tabs.jsx"},{"name":"TopNav","sourcePath":"components/navigation/TopNav.jsx"}],"sourceHashes":{"components/actions/Button.jsx":"65adfb3ba319","components/actions/IconButton.jsx":"9fb07d2e6378","components/brand/Icon.jsx":"fd943014b0e7","components/brand/Wordmark.jsx":"2e96706931dc","components/display/Badge.jsx":"9968af85c75d","components/display/Card.jsx":"03d3e160f3b9","components/display/Tag.jsx":"800554ef3987","components/feedback/Dialog.jsx":"5cb51707194f","components/feedback/Notice.jsx":"ee910193f100","components/feedback/Toast.jsx":"67cf6fcde619","components/feedback/Tooltip.jsx":"8d6e15c84e3b","components/forms/Checkbox.jsx":"cc5dfc01511f","components/forms/Input.jsx":"33ac95307c71","components/forms/Radio.jsx":"4a0478636c3a","components/forms/ScoreStepper.jsx":"8bd23d10366c","components/forms/Select.jsx":"222460b7790a","components/forms/Switch.jsx":"cecae48c9eea","components/matchday/FixtureCard.jsx":"b47866bba675","components/matchday/FixtureRow.jsx":"958dc3918c63","components/matchday/LeaderboardTable.jsx":"70f63de9464c","components/navigation/Tabs.jsx":"07150f585fc3","components/navigation/TopNav.jsx":"388a58b8b9fa","ui_kits/prediction-hub/App.jsx":"60dbde65a561","ui_kits/prediction-hub/FixturesScreen.jsx":"f5388fd650d4","ui_kits/prediction-hub/HomeScreen.jsx":"71620a872030","ui_kits/prediction-hub/LeaderboardScreen.jsx":"86b0c705f99f","ui_kits/prediction-hub/MatchScreen.jsx":"5ed42d9b2a1b","ui_kits/prediction-hub/data.js":"8002132b69c8"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.SunlitMatchdayDesignSystem_347d00 = window.SunlitMatchdayDesignSystem_347d00 || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// components/brand/Icon.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const CDN = 'https://unpkg.com/lucide-static@0.460.0/icons/';
function Icon({
  name,
  size = 20,
  color = 'currentColor',
  label,
  style,
  ...rest
}) {
  const url = 'url(' + CDN + name + '.svg)';
  return /*#__PURE__*/React.createElement("span", _extends({
    role: label ? 'img' : undefined,
    "aria-label": label,
    "aria-hidden": label ? undefined : true,
    style: {
      display: 'inline-block',
      flex: 'none',
      width: size,
      height: size,
      backgroundColor: color,
      WebkitMaskImage: url,
      maskImage: url,
      WebkitMaskRepeat: 'no-repeat',
      maskRepeat: 'no-repeat',
      WebkitMaskSize: '100% 100%',
      maskSize: '100% 100%',
      verticalAlign: 'middle',
      ...style
    }
  }, rest));
}
Object.assign(__ds_scope, { Icon });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/brand/Icon.jsx", error: String((e && e.message) || e) }); }

// components/actions/Button.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const cx = (...a) => a.filter(Boolean).join(' ');
function Button({
  variant = 'primary',
  size = 'md',
  icon,
  iconRight,
  fullWidth,
  href,
  children,
  className,
  type = 'button',
  ...rest
}) {
  const cls = cx('sm-btn', 'sm-btn--' + variant, size === 'sm' && 'sm-btn--sm', fullWidth && 'sm-btn--full', className);
  const iconSize = size === 'sm' ? 16 : 20;
  const inner = [icon && /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    key: "l",
    name: icon,
    size: iconSize
  }), /*#__PURE__*/React.createElement("span", {
    key: "c"
  }, children), iconRight && /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    key: "r",
    name: iconRight,
    size: iconSize
  })];
  if (href) return /*#__PURE__*/React.createElement("a", _extends({
    href: href,
    className: cls
  }, rest), inner);
  return /*#__PURE__*/React.createElement("button", _extends({
    type: type,
    className: cls
  }, rest), inner);
}
Object.assign(__ds_scope, { Button });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/actions/Button.jsx", error: String((e && e.message) || e) }); }

// components/actions/IconButton.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function IconButton({
  icon,
  label,
  variant = 'secondary',
  size = 'md',
  className,
  type = 'button',
  ...rest
}) {
  const cls = ['sm-iconbtn', 'sm-iconbtn--' + variant, size === 'sm' && 'sm-iconbtn--sm', className].filter(Boolean).join(' ');
  return /*#__PURE__*/React.createElement("button", _extends({
    type: type,
    className: cls,
    "aria-label": label,
    title: label
  }, rest), /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: icon,
    size: size === 'sm' ? 18 : 20
  }));
}
Object.assign(__ds_scope, { IconButton });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/actions/IconButton.jsx", error: String((e && e.message) || e) }); }

// components/brand/Wordmark.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function Wordmark({
  parts = ['sunlit', 'matchday'],
  separator = ' / ',
  size = 21,
  onDark = false,
  href,
  style,
  ...rest
}) {
  const Tag = href ? 'a' : 'span';
  return /*#__PURE__*/React.createElement(Tag, _extends({
    href: href,
    className: 'sm-wordmark' + (onDark ? ' sm-wordmark--on-dark' : ''),
    style: {
      fontSize: size,
      ...style
    }
  }, rest), parts[0], /*#__PURE__*/React.createElement("span", {
    className: "sm-wordmark__sep"
  }, separator), parts[1]);
}
Object.assign(__ds_scope, { Wordmark });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/brand/Wordmark.jsx", error: String((e && e.message) || e) }); }

// components/display/Badge.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function Badge({
  tone = 'neutral',
  icon,
  children,
  className,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("span", _extends({
    className: 'sm-badge sm-badge--' + tone + (className ? ' ' + className : '')
  }, rest), icon && /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: icon,
    size: 14
  }), children);
}
Object.assign(__ds_scope, { Badge });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/display/Badge.jsx", error: String((e && e.message) || e) }); }

// components/display/Card.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function Card({
  variant = 'default',
  padding = 'comfortable',
  interactive,
  as = 'div',
  children,
  className,
  style,
  ...rest
}) {
  const Tag = as;
  const pad = padding === 'none' ? 0 : padding === 'compact' ? 16 : 24;
  const cls = ['sm-card', variant !== 'default' && 'sm-card--' + variant, interactive && 'sm-card--interactive', className].filter(Boolean).join(' ');
  return /*#__PURE__*/React.createElement(Tag, _extends({
    className: cls,
    style: {
      padding: pad,
      ...style
    }
  }, rest), children);
}
Object.assign(__ds_scope, { Card });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/display/Card.jsx", error: String((e && e.message) || e) }); }

// components/display/Tag.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function Tag({
  selected = false,
  icon,
  children,
  onClick,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("button", _extends({
    type: "button",
    className: "sm-tag",
    "aria-pressed": selected,
    onClick: onClick
  }, rest), icon && /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: icon,
    size: 16
  }), children);
}
Object.assign(__ds_scope, { Tag });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/display/Tag.jsx", error: String((e && e.message) || e) }); }

// components/feedback/Dialog.jsx
try { (() => {
function Dialog({
  open,
  title,
  children,
  actions,
  onClose
}) {
  React.useEffect(() => {
    if (!open) return;
    const k = e => {
      if (e.key === 'Escape' && onClose) onClose();
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [open, onClose]);
  if (!open) return null;
  return /*#__PURE__*/React.createElement("div", {
    className: "sm-dialog__scrim",
    onClick: e => {
      if (e.target === e.currentTarget && onClose) onClose();
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "sm-dialog",
    role: "dialog",
    "aria-modal": "true",
    "aria-label": typeof title === 'string' ? title : undefined
  }, /*#__PURE__*/React.createElement("div", {
    className: "sm-dialog__head"
  }, /*#__PURE__*/React.createElement("h2", {
    className: "sm-dialog__title"
  }, title), onClose && /*#__PURE__*/React.createElement(__ds_scope.IconButton, {
    icon: "x",
    label: "Close",
    variant: "ghost",
    size: "sm",
    onClick: onClose
  })), /*#__PURE__*/React.createElement("div", null, children), actions && /*#__PURE__*/React.createElement("div", {
    className: "sm-dialog__foot"
  }, actions)));
}
Object.assign(__ds_scope, { Dialog });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/Dialog.jsx", error: String((e && e.message) || e) }); }

// components/feedback/Notice.jsx
try { (() => {
function Notice({
  title,
  icon,
  compact,
  children,
  style
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: 'sm-notice' + (compact ? ' sm-notice--compact' : ''),
    style: style
  }, icon && /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: icon,
    size: 20,
    style: {
      marginTop: 2
    }
  }), /*#__PURE__*/React.createElement("div", null, title && /*#__PURE__*/React.createElement("strong", {
    className: "sm-notice__title"
  }, title), /*#__PURE__*/React.createElement("div", null, children)));
}
Object.assign(__ds_scope, { Notice });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/Notice.jsx", error: String((e && e.message) || e) }); }

// components/feedback/Toast.jsx
try { (() => {
const TONES = {
  success: ['circle-check', 'var(--color-success)'],
  error: ['circle-alert', 'var(--color-error)'],
  warning: ['triangle-alert', 'var(--color-warning)'],
  info: ['info', 'var(--color-info)']
};
function Toast({
  tone = 'success',
  title,
  children,
  onClose,
  style
}) {
  const [icon, color] = TONES[tone] || TONES.info;
  return /*#__PURE__*/React.createElement("div", {
    className: "sm-toast",
    role: "status",
    style: style
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: icon,
    size: 20,
    color: color,
    style: {
      marginTop: 1
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, title && /*#__PURE__*/React.createElement("span", {
    className: "sm-toast__title"
  }, title), children && /*#__PURE__*/React.createElement("span", {
    className: "sm-toast__body"
  }, children)), onClose && /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: onClose,
    "aria-label": "Dismiss",
    className: "sm-iconbtn sm-iconbtn--ghost",
    style: {
      width: 32,
      height: 32,
      marginTop: -6,
      marginRight: -6
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "x",
    size: 16
  })));
}
Object.assign(__ds_scope, { Toast });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/Toast.jsx", error: String((e && e.message) || e) }); }

// components/feedback/Tooltip.jsx
try { (() => {
function Tooltip({
  content,
  placement = 'top',
  children
}) {
  const [open, setOpen] = React.useState(false);
  const id = React.useId();
  return /*#__PURE__*/React.createElement("span", {
    className: "sm-tooltip",
    onMouseEnter: () => setOpen(true),
    onMouseLeave: () => setOpen(false),
    onFocus: () => setOpen(true),
    onBlur: () => setOpen(false),
    "aria-describedby": open ? id : undefined
  }, children, open && /*#__PURE__*/React.createElement("span", {
    id: id,
    role: "tooltip",
    className: 'sm-tooltip__bubble' + (placement === 'bottom' ? ' sm-tooltip__bubble--bottom' : '')
  }, content));
}
Object.assign(__ds_scope, { Tooltip });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/Tooltip.jsx", error: String((e && e.message) || e) }); }

// components/forms/Checkbox.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function Checkbox({
  label,
  description,
  disabled,
  style,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("label", {
    className: 'sm-check sm-check--box' + (disabled ? ' sm-check--disabled' : ''),
    style: style
  }, /*#__PURE__*/React.createElement("input", _extends({
    type: "checkbox",
    disabled: disabled
  }, rest)), /*#__PURE__*/React.createElement("span", {
    className: "sm-check__box"
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "check",
    size: 16
  })), /*#__PURE__*/React.createElement("span", null, label, description && /*#__PURE__*/React.createElement("span", {
    className: "sm-check__desc"
  }, description)));
}
Object.assign(__ds_scope, { Checkbox });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Checkbox.jsx", error: String((e && e.message) || e) }); }

// components/forms/Input.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function Input({
  label,
  hint,
  error,
  id,
  className,
  style,
  ...rest
}) {
  const autoId = React.useId();
  const fid = id || autoId;
  const describedBy = [hint && fid + '-hint', error && fid + '-err'].filter(Boolean).join(' ') || undefined;
  return /*#__PURE__*/React.createElement("div", {
    className: "sm-field",
    style: style
  }, label && /*#__PURE__*/React.createElement("label", {
    className: "sm-field__label",
    htmlFor: fid
  }, label), /*#__PURE__*/React.createElement("input", _extends({
    id: fid,
    className: 'sm-control ' + (className || ''),
    "aria-invalid": error ? true : undefined,
    "aria-describedby": describedBy
  }, rest)), hint && !error && /*#__PURE__*/React.createElement("span", {
    id: fid + '-hint',
    className: "sm-field__hint"
  }, hint), error && /*#__PURE__*/React.createElement("span", {
    id: fid + '-err',
    className: "sm-field__error"
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "circle-alert",
    size: 16
  }), error));
}
Object.assign(__ds_scope, { Input });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Input.jsx", error: String((e && e.message) || e) }); }

// components/forms/Radio.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function Radio({
  label,
  description,
  disabled,
  style,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("label", {
    className: 'sm-check sm-check--radio' + (disabled ? ' sm-check--disabled' : ''),
    style: style
  }, /*#__PURE__*/React.createElement("input", _extends({
    type: "radio",
    disabled: disabled
  }, rest)), /*#__PURE__*/React.createElement("span", {
    className: "sm-check__box"
  }), /*#__PURE__*/React.createElement("span", null, label, description && /*#__PURE__*/React.createElement("span", {
    className: "sm-check__desc"
  }, description)));
}
Object.assign(__ds_scope, { Radio });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Radio.jsx", error: String((e && e.message) || e) }); }

// components/forms/ScoreStepper.jsx
try { (() => {
function ScoreStepper({
  team,
  value,
  defaultValue = 0,
  onChange,
  min = 0,
  max = 150,
  step = 1,
  disabled
}) {
  const [inner, setInner] = React.useState(defaultValue);
  const v = value ?? inner;
  const set = n => {
    const c = Math.max(min, Math.min(max, n));
    if (value === undefined) setInner(c);
    onChange && onChange(c);
  };
  return /*#__PURE__*/React.createElement("div", {
    className: "sm-stepper"
  }, team && /*#__PURE__*/React.createElement("span", {
    className: "sm-stepper__team"
  }, team), /*#__PURE__*/React.createElement("div", {
    className: "sm-stepper__row"
  }, /*#__PURE__*/React.createElement(__ds_scope.IconButton, {
    icon: "minus",
    label: 'Decrease ' + (team || 'score'),
    onClick: () => set(v - step),
    disabled: disabled || v <= min
  }), /*#__PURE__*/React.createElement("input", {
    className: "sm-stepper__value",
    type: "number",
    inputMode: "numeric",
    "aria-label": (team || '') + ' score',
    value: v,
    min: min,
    max: max,
    disabled: disabled,
    onChange: e => set(parseInt(e.target.value || '0', 10))
  }), /*#__PURE__*/React.createElement(__ds_scope.IconButton, {
    icon: "plus",
    label: 'Increase ' + (team || 'score'),
    onClick: () => set(v + step),
    disabled: disabled || v >= max
  })));
}
Object.assign(__ds_scope, { ScoreStepper });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/ScoreStepper.jsx", error: String((e && e.message) || e) }); }

// components/forms/Select.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function Select({
  label,
  hint,
  options = [],
  id,
  style,
  ...rest
}) {
  const autoId = React.useId();
  const fid = id || autoId;
  return /*#__PURE__*/React.createElement("div", {
    className: "sm-field",
    style: style
  }, label && /*#__PURE__*/React.createElement("label", {
    className: "sm-field__label",
    htmlFor: fid
  }, label), /*#__PURE__*/React.createElement("div", {
    className: "sm-select"
  }, /*#__PURE__*/React.createElement("select", _extends({
    id: fid,
    className: "sm-control"
  }, rest), options.map(o => {
    const opt = typeof o === 'string' ? {
      value: o,
      label: o
    } : o;
    return /*#__PURE__*/React.createElement("option", {
      key: opt.value,
      value: opt.value
    }, opt.label);
  })), /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "chevron-down",
    size: 20,
    className: "sm-select__chev"
  })), hint && /*#__PURE__*/React.createElement("span", {
    className: "sm-field__hint"
  }, hint));
}
Object.assign(__ds_scope, { Select });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Select.jsx", error: String((e && e.message) || e) }); }

// components/forms/Switch.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function Switch({
  label,
  disabled,
  style,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("label", {
    className: "sm-switch",
    style: {
      color: disabled ? 'var(--color-muted)' : undefined,
      ...style
    }
  }, /*#__PURE__*/React.createElement("input", _extends({
    type: "checkbox",
    role: "switch",
    disabled: disabled
  }, rest)), /*#__PURE__*/React.createElement("span", {
    className: "sm-switch__track"
  }), /*#__PURE__*/React.createElement("span", null, label));
}
Object.assign(__ds_scope, { Switch });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Switch.jsx", error: String((e && e.message) || e) }); }

// components/matchday/FixtureCard.jsx
try { (() => {
const STATUS = {
  open: ['neutral', 'Open for picks'],
  locked: ['warning', 'Locked'],
  live: ['live', 'Live'],
  final: ['neutral', 'Full time']
};
function FixtureCard({
  day,
  month,
  home,
  away,
  time,
  timeLabel = 'Venue-local time',
  venue,
  localTime,
  pool,
  status = 'open',
  prediction,
  score,
  actionLabel,
  onAction
}) {
  const [tone, statusText] = STATUS[status] || STATUS.open;
  const hasPick = prediction && prediction.home != null;
  const label = actionLabel || (status === 'open' ? hasPick ? 'Edit prediction' : 'Predict score' : 'View match');
  return /*#__PURE__*/React.createElement("article", {
    className: "sm-fixture"
  }, pool && /*#__PURE__*/React.createElement("div", {
    className: "sm-fixture__pool"
  }, /*#__PURE__*/React.createElement("span", {
    className: "sm-eyebrow",
    style: {
      color: 'var(--color-muted)'
    }
  }, pool), /*#__PURE__*/React.createElement(__ds_scope.Badge, {
    tone: tone,
    icon: status === 'locked' ? 'lock' : undefined
  }, statusText)), /*#__PURE__*/React.createElement("div", {
    className: "sm-fixture__main"
  }, /*#__PURE__*/React.createElement("div", {
    className: "sm-fixture__date"
  }, /*#__PURE__*/React.createElement("strong", {
    className: "sm-fixture__day"
  }, day), /*#__PURE__*/React.createElement("span", {
    className: "sm-fixture__month"
  }, month)), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h3", {
    className: "sm-fixture__teams"
  }, home, /*#__PURE__*/React.createElement("br", null), "vs ", away), /*#__PURE__*/React.createElement("p", {
    className: "sm-fixture__time"
  }, /*#__PURE__*/React.createElement("strong", null, time), " \xB7 ", timeLabel), localTime && /*#__PURE__*/React.createElement("p", {
    className: "sm-fixture__meta"
  }, localTime), venue && /*#__PURE__*/React.createElement("p", {
    className: "sm-fixture__meta"
  }, venue))), /*#__PURE__*/React.createElement("div", {
    className: "sm-fixture__foot"
  }, score ? /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement("span", {
    className: "sm-fixture__score"
  }, score.home, " \u2013 ", score.away), hasPick && /*#__PURE__*/React.createElement("span", {
    className: "sm-fixture__meta",
    style: {
      marginLeft: 12
    }
  }, "You: ", prediction.home, " \u2013 ", prediction.away)) : hasPick ? /*#__PURE__*/React.createElement(__ds_scope.Badge, {
    tone: "success",
    icon: "check"
  }, "Your pick ", prediction.home, " \u2013 ", prediction.away) : /*#__PURE__*/React.createElement(__ds_scope.Badge, null, "No pick yet"), onAction && /*#__PURE__*/React.createElement(__ds_scope.Button, {
    size: "sm",
    variant: status === 'open' && !hasPick ? 'primary' : 'secondary',
    onClick: onAction
  }, label)));
}
Object.assign(__ds_scope, { FixtureCard });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/matchday/FixtureCard.jsx", error: String((e && e.message) || e) }); }

// components/matchday/FixtureRow.jsx
try { (() => {
function FixtureRow({
  time,
  date,
  home,
  away,
  pool,
  venue,
  status = 'open',
  prediction,
  score,
  onAction,
  actionLabel
}) {
  const hasPick = prediction && prediction.home != null;
  return /*#__PURE__*/React.createElement("div", {
    className: "sm-frow"
  }, /*#__PURE__*/React.createElement("div", {
    className: "sm-frow__time"
  }, time, /*#__PURE__*/React.createElement("small", null, date)), /*#__PURE__*/React.createElement("div", {
    className: "sm-frow__teams"
  }, home, " v ", away, pool && /*#__PURE__*/React.createElement("small", null, pool)), /*#__PURE__*/React.createElement("div", {
    className: "sm-frow__venue"
  }, venue), /*#__PURE__*/React.createElement("div", {
    className: 'sm-frow__pick' + (hasPick || score ? '' : ' sm-frow__pick--empty')
  }, score ? /*#__PURE__*/React.createElement("span", null, score.home, " \u2013 ", score.away) : hasPick ? /*#__PURE__*/React.createElement("span", null, prediction.home, " \u2013 ", prediction.away) : status === 'live' ? /*#__PURE__*/React.createElement(__ds_scope.Badge, {
    tone: "live"
  }, "Live") : status === 'locked' ? 'Locked' : 'No pick'), /*#__PURE__*/React.createElement("div", null, onAction && /*#__PURE__*/React.createElement(__ds_scope.Button, {
    size: "sm",
    variant: status === 'open' && !hasPick ? 'primary' : 'ghost',
    onClick: onAction
  }, actionLabel || (status === 'open' ? hasPick ? 'Edit' : 'Predict' : 'View'))));
}
Object.assign(__ds_scope, { FixtureRow });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/matchday/FixtureRow.jsx", error: String((e && e.message) || e) }); }

// components/matchday/LeaderboardTable.jsx
try { (() => {
function Move({
  n
}) {
  if (!n) return /*#__PURE__*/React.createElement("span", {
    className: "sm-lb__move sm-lb__move--same",
    "aria-label": "No change"
  }, "\u2013");
  const up = n > 0;
  return /*#__PURE__*/React.createElement("span", {
    className: 'sm-lb__move sm-lb__move--' + (up ? 'up' : 'down'),
    "aria-label": (up ? 'Up ' : 'Down ') + Math.abs(n)
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: up ? 'arrow-up' : 'arrow-down',
    size: 14
  }), Math.abs(n));
}
function LeaderboardTable({
  rows = [],
  showExact = true
}) {
  return /*#__PURE__*/React.createElement("table", {
    className: "sm-lb"
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", null, "Rank"), /*#__PURE__*/React.createElement("th", null, "Player"), /*#__PURE__*/React.createElement("th", null), showExact && /*#__PURE__*/React.createElement("th", {
    className: "num"
  }, "Exact"), /*#__PURE__*/React.createElement("th", {
    className: "num"
  }, "Points"))), /*#__PURE__*/React.createElement("tbody", null, rows.map(r => /*#__PURE__*/React.createElement("tr", {
    key: r.rank + r.name,
    className: r.you ? 'sm-lb__you' : undefined
  }, /*#__PURE__*/React.createElement("td", {
    className: "sm-lb__rank"
  }, r.rank), /*#__PURE__*/React.createElement("td", null, r.name, r.you && /*#__PURE__*/React.createElement("span", {
    style: {
      fontWeight: 400,
      color: 'var(--color-muted)',
      marginLeft: 8,
      fontSize: 14
    }
  }, "You")), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement(Move, {
    n: r.movement
  })), showExact && /*#__PURE__*/React.createElement("td", {
    className: "num"
  }, r.exact), /*#__PURE__*/React.createElement("td", {
    className: "num",
    style: {
      fontWeight: 700
    }
  }, r.points)))));
}
Object.assign(__ds_scope, { LeaderboardTable });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/matchday/LeaderboardTable.jsx", error: String((e && e.message) || e) }); }

// components/navigation/Tabs.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function Tabs({
  items = [],
  value,
  onChange,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("div", _extends({
    className: "sm-tabs",
    role: "tablist"
  }, rest), items.map(it => {
    const t = typeof it === 'string' ? {
      value: it,
      label: it
    } : it;
    const sel = t.value === value;
    return /*#__PURE__*/React.createElement("button", {
      key: t.value,
      type: "button",
      role: "tab",
      "aria-selected": sel,
      className: "sm-tab",
      onClick: () => onChange && onChange(t.value)
    }, t.label, t.count != null && /*#__PURE__*/React.createElement("span", {
      className: "sm-tab__count"
    }, t.count));
  }));
}
Object.assign(__ds_scope, { Tabs });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/Tabs.jsx", error: String((e && e.message) || e) }); }

// components/navigation/TopNav.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function TopNav({
  links = [],
  current,
  onNavigate,
  right,
  wordmark,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("header", _extends({
    className: "sm-topnav"
  }, rest), /*#__PURE__*/React.createElement("div", {
    className: "sm-topnav__inner"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 40,
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Wordmark, _extends({}, wordmark || {}, {
    href: wordmark && wordmark.href || '#',
    onClick: e => {
      if (onNavigate) {
        e.preventDefault();
        onNavigate(links[0] && (links[0].value || links[0]));
      }
    }
  })), /*#__PURE__*/React.createElement("nav", {
    className: "sm-topnav__links",
    "aria-label": "Main"
  }, links.map(l => {
    const t = typeof l === 'string' ? {
      value: l,
      label: l
    } : l;
    return /*#__PURE__*/React.createElement("a", {
      key: t.value,
      href: '#' + t.value,
      className: "sm-navlink",
      "aria-current": t.value === current ? 'page' : undefined,
      onClick: e => {
        if (onNavigate) {
          e.preventDefault();
          onNavigate(t.value);
        }
      }
    }, t.label);
  }))), right && /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 12
    }
  }, right)));
}
Object.assign(__ds_scope, { TopNav });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/TopNav.jsx", error: String((e && e.message) || e) }); }

// ui_kits/prediction-hub/App.jsx
try { (() => {
var DS = window.SunlitMatchdayDesignSystem_347d00;
function App() {
  const {
    TopNav,
    Button,
    Toast,
    Notice
  } = DS;
  const D = window.HUB_DATA;
  const [screen, setScreen] = React.useState(() => localStorage.getItem('hub.screen') || 'home');
  const [matchId, setMatchId] = React.useState(() => localStorage.getItem('hub.match') || 'm3');
  const [picks, setPicks] = React.useState(D.initialPicks);
  const [toast, setToast] = React.useState(null);
  React.useEffect(() => {
    localStorage.setItem('hub.screen', screen);
    localStorage.setItem('hub.match', matchId);
    window.scrollTo(0, 0);
  }, [screen, matchId]);
  React.useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(t);
  }, [toast]);
  const openMatch = id => {
    setMatchId(id);
    setScreen('match');
  };
  const match = D.fixtures.find(m => m.id === matchId);
  const save = (id, p) => {
    setPicks({
      ...picks,
      [id]: p
    });
    const m = D.fixtures.find(x => x.id === id);
    setToast({
      title: 'Prediction saved',
      body: m.home + ' ' + p.home + ' – ' + p.away + ' ' + m.away
    });
  };
  const nav = screen === 'match' ? 'fixtures' : screen;
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(TopNav, {
    current: nav,
    onNavigate: v => setScreen(v === undefined ? 'home' : v),
    wordmark: {
      href: '#home'
    },
    links: [{
      value: 'home',
      label: 'Home'
    }, {
      value: 'fixtures',
      label: 'Fixtures'
    }, {
      value: 'table',
      label: 'Leaderboard'
    }],
    right: /*#__PURE__*/React.createElement(Button, {
      size: "sm",
      variant: "secondary",
      icon: "user"
    }, "Sam K.")
  }), screen === 'home' && /*#__PURE__*/React.createElement(HomeScreen, {
    fixtures: D.fixtures,
    picks: picks,
    go: setScreen,
    openMatch: openMatch
  }), screen === 'fixtures' && /*#__PURE__*/React.createElement(FixturesScreen, {
    fixtures: D.fixtures,
    picks: picks,
    openMatch: openMatch
  }), screen === 'match' && /*#__PURE__*/React.createElement(MatchScreen, {
    key: match.id,
    match: match,
    pick: picks[match.id],
    onSave: save,
    back: () => setScreen('fixtures')
  }), screen === 'table' && /*#__PURE__*/React.createElement(LeaderboardScreen, {
    data: D.leaderboard
  }), /*#__PURE__*/React.createElement("footer", {
    className: "hub-wrap",
    style: {
      padding: '48px 0'
    }
  }, /*#__PURE__*/React.createElement(Notice, {
    compact: true
  }, "An independent project. Not affiliated with or endorsed by World Rugby or Rugby World Cup Limited. Teams, venues and fixtures shown are fictional demo content.")), toast && /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'fixed',
      right: 24,
      bottom: 24,
      zIndex: 200
    }
  }, /*#__PURE__*/React.createElement(Toast, {
    title: toast.title,
    onClose: () => setToast(null)
  }, toast.body)));
}
ReactDOM.createRoot(document.getElementById('root')).render(/*#__PURE__*/React.createElement(App, null));
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/prediction-hub/App.jsx", error: String((e && e.message) || e) }); }

// ui_kits/prediction-hub/FixturesScreen.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
var DS = window.SunlitMatchdayDesignSystem_347d00;
function FixturesScreen({
  fixtures,
  picks,
  openMatch
}) {
  const {
    Tabs,
    Tag,
    Select,
    Card,
    FixtureRow
  } = DS;
  const [tab, setTab] = React.useState('up');
  const [pool, setPool] = React.useState('All pools');
  const [mine, setMine] = React.useState(false);
  const list = fixtures.filter(m => tab === 'up' ? m.status !== 'final' : m.status === 'final').filter(m => pool === 'All pools' || m.pool === pool).filter(m => !mine || picks[m.id]);
  const dates = [...new Set(list.map(m => m.date))];
  return /*#__PURE__*/React.createElement("main", {
    className: "hub-wrap",
    style: {
      paddingTop: 48
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "hub-section-head",
    style: {
      alignItems: 'flex-end'
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("p", {
    className: "sm-eyebrow",
    style: {
      margin: '0 0 12px'
    }
  }, "Demo fixtures \xB7 not the official schedule"), /*#__PURE__*/React.createElement("h1", {
    className: "hub-h1",
    style: {
      fontSize: 56
    }
  }, "Fixtures")), /*#__PURE__*/React.createElement("div", {
    style: {
      width: 240
    }
  }, /*#__PURE__*/React.createElement(Select, {
    label: "Show times in",
    options: ['Venue-local time', 'My local time (AEDT)']
  }))), /*#__PURE__*/React.createElement(Tabs, {
    value: tab,
    onChange: setTab,
    items: [{
      value: 'up',
      label: 'Upcoming',
      count: fixtures.filter(m => m.status !== 'final').length
    }, {
      value: 'res',
      label: 'Results',
      count: fixtures.filter(m => m.status === 'final').length
    }]
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8,
      flexWrap: 'wrap',
      margin: '24px 0 32px'
    }
  }, ['All pools', 'Pool A', 'Pool B', 'Pool C', 'Pool D'].map(p => /*#__PURE__*/React.createElement(Tag, {
    key: p,
    selected: pool === p,
    onClick: () => setPool(p)
  }, p)), /*#__PURE__*/React.createElement(Tag, {
    icon: "star",
    selected: mine,
    onClick: () => setMine(!mine)
  }, "My picks")), dates.length === 0 && /*#__PURE__*/React.createElement("p", {
    style: {
      color: 'var(--color-muted)'
    }
  }, "No fixtures match these filters."), dates.map(d => /*#__PURE__*/React.createElement("div", {
    key: d,
    style: {
      marginBottom: 32
    }
  }, /*#__PURE__*/React.createElement("h2", {
    style: {
      fontSize: 16,
      fontWeight: 700,
      margin: '0 0 12px'
    }
  }, d), /*#__PURE__*/React.createElement(Card, {
    padding: "none",
    style: {
      overflow: 'hidden'
    }
  }, list.filter(m => m.date === d).map(m => /*#__PURE__*/React.createElement(FixtureRow, _extends({
    key: m.id
  }, m, {
    date: "Venue time",
    prediction: picks[m.id],
    onAction: () => openMatch(m.id)
  })))))));
}
window.FixturesScreen = FixturesScreen;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/prediction-hub/FixturesScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/prediction-hub/HomeScreen.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
var DS = window.SunlitMatchdayDesignSystem_347d00;
function HomeScreen({
  fixtures,
  picks,
  go,
  openMatch
}) {
  const {
    Button,
    FixtureCard,
    FixtureRow,
    Card,
    Notice
  } = DS;
  const round = fixtures.filter(m => m.round === 2);
  const next = round[0];
  const made = round.filter(m => picks[m.id]).length;
  return /*#__PURE__*/React.createElement("main", {
    className: "hub-wrap"
  }, /*#__PURE__*/React.createElement("div", {
    className: "hub-hero"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("p", {
    className: "sm-eyebrow",
    style: {
      margin: '0 0 16px'
    }
  }, "Round 2 \xB7 Picks close at each kick-off"), /*#__PURE__*/React.createElement("h1", {
    className: "hub-h1"
  }, "Call the score.", /*#__PURE__*/React.createElement("br", null), /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--color-clay)'
    }
  }, "Back your read.")), /*#__PURE__*/React.createElement("p", {
    className: "hub-lead"
  }, "Predict every match, climb your league table and see how close you got when the final whistle goes."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 12,
      flexWrap: 'wrap',
      marginTop: 32
    }
  }, /*#__PURE__*/React.createElement(Button, {
    icon: "pencil",
    onClick: () => openMatch(next.id)
  }, "Predict round 2"), /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    onClick: () => go('fixtures')
  }, "Find your next match"))), /*#__PURE__*/React.createElement(FixtureCard, _extends({}, next, {
    pool: next.pool + ' · Round ' + next.round,
    venue: next.venue + ' · Example venue',
    localTime: "18:30 your time (AEDT)",
    prediction: picks[next.id],
    onAction: () => openMatch(next.id)
  }))), /*#__PURE__*/React.createElement("div", {
    className: "hub-strip"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("strong", null, made, " of ", round.length, " picks made"), /*#__PURE__*/React.createElement("span", null, "Round 2 \xB7 ", round.length - made, " still open")), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("strong", null, "2nd in Harbour Mates"), /*#__PURE__*/React.createElement("span", null, "38 points \xB7 4 behind the lead")), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("strong", null, "1 exact score so far"), /*#__PURE__*/React.createElement("span", null, "Worth 5 bonus points each"))), /*#__PURE__*/React.createElement("section", {
    className: "hub-section"
  }, /*#__PURE__*/React.createElement("div", {
    className: "hub-section-head"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("p", {
    className: "sm-eyebrow",
    style: {
      margin: '0 0 12px'
    }
  }, "This round"), /*#__PURE__*/React.createElement("h2", {
    className: "hub-h2"
  }, "Your picks, all together.")), /*#__PURE__*/React.createElement(Button, {
    variant: "ghost",
    iconRight: "arrow-right",
    onClick: () => go('fixtures')
  }, "All fixtures")), /*#__PURE__*/React.createElement(Card, {
    padding: "none",
    style: {
      overflow: 'hidden'
    }
  }, round.slice(0, 4).map(m => /*#__PURE__*/React.createElement(FixtureRow, _extends({
    key: m.id
  }, m, {
    prediction: picks[m.id],
    onAction: () => openMatch(m.id)
  }))))));
}
window.HomeScreen = HomeScreen;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/prediction-hub/HomeScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/prediction-hub/LeaderboardScreen.jsx
try { (() => {
var DS = window.SunlitMatchdayDesignSystem_347d00;
function LeaderboardScreen({
  data
}) {
  const {
    Tabs,
    Select,
    Card,
    LeaderboardTable,
    Button,
    Notice
  } = DS;
  const [tab, setTab] = React.useState('overall');
  return /*#__PURE__*/React.createElement("main", {
    className: "hub-wrap",
    style: {
      paddingTop: 48
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "hub-section-head",
    style: {
      alignItems: 'flex-end'
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("p", {
    className: "sm-eyebrow",
    style: {
      margin: '0 0 12px'
    }
  }, "Private league \xB7 6 players"), /*#__PURE__*/React.createElement("h1", {
    className: "hub-h1",
    style: {
      fontSize: 56
    }
  }, "Harbour Mates")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 12,
      alignItems: 'flex-end',
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 220
    }
  }, /*#__PURE__*/React.createElement(Select, {
    label: "League",
    options: ['Harbour Mates', 'Work sweep', 'Everyone']
  })), /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    icon: "user-plus"
  }, "Invite"))), /*#__PURE__*/React.createElement(Tabs, {
    value: tab,
    onChange: setTab,
    items: [{
      value: 'overall',
      label: 'Overall'
    }, {
      value: 'round',
      label: 'Round 1'
    }]
  }), /*#__PURE__*/React.createElement(Card, {
    padding: "none",
    style: {
      overflow: 'hidden',
      marginTop: 24
    }
  }, /*#__PURE__*/React.createElement(LeaderboardTable, {
    rows: data[tab]
  })), /*#__PURE__*/React.createElement(Notice, {
    compact: true,
    icon: "info",
    style: {
      marginTop: 24
    }
  }, "Ties split by exact scores, then by earliest pick. Tables update after every full-time whistle."));
}
window.LeaderboardScreen = LeaderboardScreen;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/prediction-hub/LeaderboardScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/prediction-hub/MatchScreen.jsx
try { (() => {
var DS = window.SunlitMatchdayDesignSystem_347d00;
function MatchScreen({
  match: m,
  pick,
  onSave,
  back
}) {
  const {
    Button,
    Card,
    ScoreStepper,
    Badge,
    Notice,
    Dialog,
    Checkbox,
    Tooltip,
    IconButton
  } = DS;
  const [h, setH] = React.useState(pick ? pick.home : 0);
  const [a, setA] = React.useState(pick ? pick.away : 0);
  const [confirm, setConfirm] = React.useState(false);
  const final = m.status === 'final';
  const result = h === a ? 'Draw' : (h > a ? m.home : m.away) + ' by ' + Math.abs(h - a);
  return /*#__PURE__*/React.createElement("main", {
    className: "hub-wrap",
    style: {
      paddingTop: 32
    }
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "ghost",
    size: "sm",
    icon: "arrow-left",
    onClick: back,
    style: {
      marginLeft: -16
    }
  }, "Fixtures"), /*#__PURE__*/React.createElement("div", {
    className: "hub-match-hero"
  }, /*#__PURE__*/React.createElement("p", {
    className: "sm-eyebrow",
    style: {
      margin: '0 0 12px'
    }
  }, m.pool, " \xB7 Round ", m.round), /*#__PURE__*/React.createElement("h1", {
    className: "hub-h1",
    style: {
      color: '#fff',
      margin: 0
    }
  }, m.home, " ", /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--color-sun)'
    }
  }, "v"), " ", m.away), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '16px 0 0',
      fontSize: 18
    }
  }, /*#__PURE__*/React.createElement("strong", {
    style: {
      fontVariantNumeric: 'tabular-nums'
    }
  }, m.date, " \xB7 ", m.time), " venue-local time \xB7 ", m.venue)), /*#__PURE__*/React.createElement("div", {
    className: "hub-match-grid"
  }, /*#__PURE__*/React.createElement(Card, null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 24
    }
  }, /*#__PURE__*/React.createElement("h2", {
    style: {
      fontSize: 22,
      lineHeight: 1.2,
      fontWeight: 600,
      margin: 0
    }
  }, final ? 'Full time' : 'Your prediction'), final ? /*#__PURE__*/React.createElement(Badge, null, "Full time") : pick ? /*#__PURE__*/React.createElement(Badge, {
    tone: "success",
    icon: "check"
  }, "Saved") : /*#__PURE__*/React.createElement(Badge, null, "No pick yet")), final ? /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: 'center',
      padding: '8px 0 16px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      font: '700 72px/1 var(--font-display)',
      fontVariantNumeric: 'tabular-nums'
    }
  }, m.score.home, " \u2013 ", m.score.away), /*#__PURE__*/React.createElement("p", {
    style: {
      color: 'var(--color-muted)',
      margin: '12px 0 0'
    }
  }, pick ? 'You picked ' + pick.home + ' – ' + pick.away : 'You didn’t pick this match')) : /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-around',
      gap: 16,
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement(ScoreStepper, {
    team: m.home,
    value: h,
    onChange: setH
  }), /*#__PURE__*/React.createElement(ScoreStepper, {
    team: m.away,
    value: a,
    onChange: setA
  })), /*#__PURE__*/React.createElement("p", {
    style: {
      textAlign: 'center',
      margin: '24px 0',
      fontWeight: 600
    }
  }, result), /*#__PURE__*/React.createElement("div", {
    style: {
      borderTop: '1px solid var(--color-border-subtle)',
      paddingTop: 16,
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 16,
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement(Checkbox, {
    label: "Remind me an hour before kick-off",
    defaultChecked: true
  }), /*#__PURE__*/React.createElement(Button, {
    icon: "check",
    onClick: () => setConfirm(true)
  }, pick ? 'Update prediction' : 'Lock in prediction')))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gap: 16,
      alignContent: 'start'
    }
  }, /*#__PURE__*/React.createElement(Notice, {
    title: "How scoring works",
    icon: "info"
  }, "3 points for the right result. 5 more for the exact score. Demo rules."), /*#__PURE__*/React.createElement(Card, {
    padding: "compact"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between'
    }
  }, /*#__PURE__*/React.createElement("strong", null, "Harbour Mates picks"), /*#__PURE__*/React.createElement(Tooltip, {
    content: "Revealed at kick-off so nobody copies"
  }, /*#__PURE__*/React.createElement(IconButton, {
    icon: "eye-off",
    label: "Why hidden",
    variant: "ghost",
    size: "sm"
  }))), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '4px 0 0',
      fontSize: 14,
      color: 'var(--color-muted)'
    }
  }, final ? '4 of 6 backed ' + m.home + '.' : 'Your league’s picks appear after kick-off.')))), /*#__PURE__*/React.createElement(Dialog, {
    open: confirm,
    onClose: () => setConfirm(false),
    title: "Lock in your pick?",
    actions: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(Button, {
      variant: "secondary",
      onClick: () => setConfirm(false)
    }, "Keep editing"), /*#__PURE__*/React.createElement(Button, {
      onClick: () => {
        setConfirm(false);
        onSave(m.id, {
          home: h,
          away: a
        });
      }
    }, "Lock in ", h, " \u2013 ", a))
  }, /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0
    }
  }, m.home, " ", h, " \u2013 ", a, " ", m.away, ". You can change it any time before ", m.time, " venue-local time.")));
}
window.MatchScreen = MatchScreen;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/prediction-hub/MatchScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/prediction-hub/data.js
try { (() => {
window.HUB_DATA = {
  fixtures: [{
    id: 'm1',
    day: '08',
    month: 'October',
    date: 'Fri 8 Oct',
    time: '15:00',
    home: 'Harbour XV',
    away: 'Plains XV',
    pool: 'Pool A',
    round: 1,
    venue: 'Harbour Ground',
    status: 'final',
    score: {
      home: 31,
      away: 12
    }
  }, {
    id: 'm2',
    day: '08',
    month: 'October',
    date: 'Fri 8 Oct',
    time: '19:45',
    home: 'Ridge XV',
    away: 'Delta XV',
    pool: 'Pool D',
    round: 1,
    venue: 'Riverside Oval',
    status: 'final',
    score: {
      home: 20,
      away: 20
    }
  }, {
    id: 'm3',
    day: '09',
    month: 'October',
    date: 'Sat 9 Oct',
    time: '17:30',
    home: 'North XV',
    away: 'South XV',
    pool: 'Pool B',
    round: 2,
    venue: 'Harbour Ground',
    status: 'open'
  }, {
    id: 'm4',
    day: '09',
    month: 'October',
    date: 'Sat 9 Oct',
    time: '20:00',
    home: 'Coast XV',
    away: 'Range XV',
    pool: 'Pool C',
    round: 2,
    venue: 'Bayside Park',
    status: 'open'
  }, {
    id: 'm5',
    day: '10',
    month: 'October',
    date: 'Sun 10 Oct',
    time: '13:00',
    home: 'Summit XV',
    away: 'Valley XV',
    pool: 'Pool A',
    round: 2,
    venue: 'Riverside Oval',
    status: 'open'
  }, {
    id: 'm6',
    day: '10',
    month: 'October',
    date: 'Sun 10 Oct',
    time: '16:30',
    home: 'Delta XV',
    away: 'Harbour XV',
    pool: 'Pool D',
    round: 2,
    venue: 'Eastern Stadium',
    status: 'open'
  }, {
    id: 'm7',
    day: '11',
    month: 'October',
    date: 'Mon 11 Oct',
    time: '18:00',
    home: 'Plains XV',
    away: 'Ridge XV',
    pool: 'Pool B',
    round: 2,
    venue: 'Bayside Park',
    status: 'open'
  }, {
    id: 'm8',
    day: '11',
    month: 'October',
    date: 'Mon 11 Oct',
    time: '20:45',
    home: 'Range XV',
    away: 'Summit XV',
    pool: 'Pool C',
    round: 2,
    venue: 'Harbour Ground',
    status: 'open'
  }],
  initialPicks: {
    m1: {
      home: 27,
      away: 10
    },
    m2: {
      home: 17,
      away: 22
    },
    m4: {
      home: 18,
      away: 21
    }
  },
  leaderboard: {
    overall: [{
      rank: 1,
      name: 'Mia R.',
      points: 42,
      exact: 2,
      movement: 2
    }, {
      rank: 2,
      name: 'Sam K.',
      points: 38,
      exact: 1,
      movement: -1,
      you: true
    }, {
      rank: 3,
      name: 'Dev P.',
      points: 35,
      exact: 1,
      movement: 1
    }, {
      rank: 4,
      name: 'Aroha T.',
      points: 31,
      exact: 0,
      movement: -2
    }, {
      rank: 5,
      name: 'Liam O.',
      points: 28,
      exact: 1,
      movement: 0
    }, {
      rank: 6,
      name: 'Priya S.',
      points: 22,
      exact: 0,
      movement: 0
    }],
    round: [{
      rank: 1,
      name: 'Dev P.',
      points: 11,
      exact: 1,
      movement: 0
    }, {
      rank: 2,
      name: 'Mia R.',
      points: 8,
      exact: 0,
      movement: 0
    }, {
      rank: 3,
      name: 'Sam K.',
      points: 3,
      exact: 0,
      movement: 0,
      you: true
    }, {
      rank: 4,
      name: 'Liam O.',
      points: 3,
      exact: 0,
      movement: 0
    }, {
      rank: 5,
      name: 'Aroha T.',
      points: 0,
      exact: 0,
      movement: 0
    }, {
      rank: 6,
      name: 'Priya S.',
      points: 0,
      exact: 0,
      movement: 0
    }]
  }
};
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/prediction-hub/data.js", error: String((e && e.message) || e) }); }

__ds_ns.Button = __ds_scope.Button;

__ds_ns.IconButton = __ds_scope.IconButton;

__ds_ns.Icon = __ds_scope.Icon;

__ds_ns.Wordmark = __ds_scope.Wordmark;

__ds_ns.Badge = __ds_scope.Badge;

__ds_ns.Card = __ds_scope.Card;

__ds_ns.Tag = __ds_scope.Tag;

__ds_ns.Dialog = __ds_scope.Dialog;

__ds_ns.Notice = __ds_scope.Notice;

__ds_ns.Toast = __ds_scope.Toast;

__ds_ns.Tooltip = __ds_scope.Tooltip;

__ds_ns.Checkbox = __ds_scope.Checkbox;

__ds_ns.Input = __ds_scope.Input;

__ds_ns.Radio = __ds_scope.Radio;

__ds_ns.ScoreStepper = __ds_scope.ScoreStepper;

__ds_ns.Select = __ds_scope.Select;

__ds_ns.Switch = __ds_scope.Switch;

__ds_ns.FixtureCard = __ds_scope.FixtureCard;

__ds_ns.FixtureRow = __ds_scope.FixtureRow;

__ds_ns.LeaderboardTable = __ds_scope.LeaderboardTable;

__ds_ns.Tabs = __ds_scope.Tabs;

__ds_ns.TopNav = __ds_scope.TopNav;

})();
