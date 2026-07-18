(() => {
  'use strict';

  const portfolioData = window.PORTFOLIO_DATA && typeof window.PORTFOLIO_DATA === 'object'
    ? window.PORTFOLIO_DATA
    : {};
  const siteContent = portfolioData.site && typeof portfolioData.site === 'object'
    ? portfolioData.site
    : {};
  const profileContent = portfolioData.profile && typeof portfolioData.profile === 'object'
    ? portfolioData.profile
    : {};

  const normalizeTags = (value) => {
    const source = Array.isArray(value) ? value : String(value || '').split(/\s*(?:\/|,)\s*/);
    return [...new Set(source.map((tag) => String(tag).trim()).filter(Boolean))];
  };
  const normalizeProjectTags = (project) => {
    const tags = normalizeTags(project.tags);
    ['highlight', 'live'].forEach((legacyTag) => {
      if (project[legacyTag] === true && !tags.includes(legacyTag)) tags.push(legacyTag);
    });
    return tags;
  };
  const normalizePeriods = (project) => {
    const source = Array.isArray(project.periods)
      ? project.periods
      : (project.dateStart ? [{ dateStart: project.dateStart, dateEnd: project.dateEnd }] : []);
    return source
      .map((period) => ({
        dateStart: String(period?.dateStart || '').trim(),
        dateEnd: String(period?.dateEnd || '').trim()
      }))
      .filter((period) => period.dateStart);
  };
  const collectSearchValues = (value) => {
    if (Array.isArray(value)) return value.flatMap(collectSearchValues);
    if (value && typeof value === 'object') return Object.values(value).flatMap(collectSearchValues);
    return value === undefined || value === null ? [] : [String(value)];
  };
  const normalizeSearchText = (value) => String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
  const buildProjectSearchText = (project) => collectSearchValues(project)
    .map(normalizeSearchText)
    .filter(Boolean)
    .join('\u0000');
  const projects = Array.isArray(portfolioData.projects)
    ? portfolioData.projects.map((project) => {
      const normalizedProject = {
        ...project,
        platform: normalizeTags(project.platform),
        position: normalizeTags(project.position),
        tags: normalizeProjectTags(project),
        periods: normalizePeriods(project)
      };
      return { ...normalizedProject, _searchText: buildProjectSearchText(normalizedProject) };
    })
    : [];
  const timeline = document.getElementById('timeline');
  const scroller = document.getElementById('timeline-scroll');
  const navigator = document.getElementById('timeline-range');
  const zoomOutButton = document.getElementById('zoom-out');
  const zoomInButton = document.getElementById('zoom-in');
  const tooltip = document.getElementById('project-tooltip');
  const searchInput = document.getElementById('project-search');
  const statusInputs = [...document.querySelectorAll('input[name="status"]')];
  const typeInputs = [...document.querySelectorAll('input[name="type"]')];
  const platformFilters = document.getElementById('platform-filters');
  const positionFilters = document.getElementById('position-filters');
  const positionDropdown = document.getElementById('position-dropdown');
  const positionSummary = document.getElementById('position-summary');
  const tagFilters = document.getElementById('tag-filters');
  const now = new Date();
  let yearWidth = 260;
  const MIN_YEAR_WIDTH = 65;
  const MAX_YEAR_WIDTH = 2080;
  const EDGE = 90;
  const MIN_BAR_WIDTH = 190;
  const MIN_RENDERED_BAR_WIDTH = 18;
  const BAR_HORIZONTAL_GAP = 8;
  const AXIS_Y = 48;
  const BAR_TOP = AXIS_Y + 64;
  const BAR_STEP = 52;
  let activeAnchor = null;
  let hideTimer = null;

  const datedProjects = projects.filter((project) => project.periods.length);
  const rawYears = datedProjects
    .flatMap((project) => project.periods.flatMap((period) => [period.dateStart, period.dateEnd]))
    .filter(Boolean)
    .map((value) => Number(String(value).slice(0, 4)));
  const minYear = Math.min(...rawYears);
  const maxYear = Math.max(now.getFullYear(), ...rawYears);
  const years = Array.from({ length: maxYear - minYear + 1 }, (_, index) => minYear + index);
  let timelineWidth = EDGE * 2 + years.length * yearWidth;
  const todayValue = dateToYearValue(now);

  const create = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };

  function renderPortfolioContent() {
    const profileName = String(profileContent.name || '').trim();
    const pageTitle = String(siteContent.title || '').trim() ||
      (profileName ? profileName + ' — Projects Timeline' : 'Project Timeline');
    const pageDescription = String(siteContent.description || '').trim();
    const photoPath = String(profileContent.photo || '').trim();

    document.title = pageTitle;
    const descriptionMeta = document.querySelector('meta[name="description"]');
    if (descriptionMeta) descriptionMeta.content = pageDescription;

    document.getElementById('profile-label').textContent = String(siteContent.portfolioLabel || '').trim();
    document.getElementById('profile-name').textContent = profileName;

    const photo = document.getElementById('profile-photo');
    photo.hidden = !photoPath;
    photo.alt = profileName;
    if (photoPath) photo.src = photoPath;
    else photo.removeAttribute('src');

    const contacts = document.getElementById('contact-links');
    contacts.replaceChildren();
    contacts.setAttribute('aria-label', profileName ? 'Contact ' + profileName : 'Contact links');
    const contactItems = Array.isArray(profileContent.contacts) ? profileContent.contacts : [];
    contactItems.forEach((contact) => {
      const label = String(contact?.label || '').trim();
      const url = String(contact?.url || '').trim();
      if (!label || !url) return;
      const link = create('a', 'contact-link');
      link.href = url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.append(create('span', '', label), create('span', '', '↗'));
      link.lastElementChild.setAttribute('aria-hidden', 'true');
      contacts.append(link);
    });
  }

  renderPortfolioContent();

  const platformNames = [...new Set(projects.flatMap((project) => project.platform))]
    .sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }));
  const platformInputs = platformNames.map((platform) => {
    const label = create('label', 'filter-chip platform');
    const input = create('input');
    input.type = 'checkbox';
    input.name = 'platform';
    input.value = platform;
    input.checked = true;
    const dot = create('i', 'filter-dot');
    dot.setAttribute('aria-hidden', 'true');
    label.append(input, dot, create('span', '', platform));
    platformFilters.append(label);
    return input;
  });

  const positionNames = [...new Set(projects.flatMap((project) => project.position))]
    .sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }));
  const positionInputs = positionNames.map((position) => {
    const label = create('label', 'dropdown-option');
    const input = create('input');
    input.type = 'checkbox';
    input.name = 'position';
    input.value = position;
    input.checked = true;
    label.append(input, create('span', '', position));
    positionFilters.append(label);
    return input;
  });

  function updatePositionSummary() {
    const selected = positionInputs.filter((input) => input.checked);
    if (selected.length === positionInputs.length) positionSummary.textContent = 'All positions';
    else if (!selected.length) positionSummary.textContent = 'No positions';
    else if (selected.length === 1) positionSummary.textContent = selected[0].value;
    else positionSummary.textContent = selected.length + ' positions';
  }

  updatePositionSummary();

  const formatTagLabel = (tag) => tag
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
  const projectTagNames = [...new Set(projects.flatMap((project) => project.tags))]
    .sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }));
  const tagInputs = projectTagNames.map((tag) => {
    const label = create('label', 'tag-filter');
    const input = create('input');
    input.type = 'checkbox';
    input.name = 'tag';
    input.value = tag;
    input.checked = false;
    const checkMark = create('span', 'check-mark', '✓');
    checkMark.setAttribute('aria-hidden', 'true');
    label.append(input, checkMark, create('span', '', formatTagLabel(tag)));
    tagFilters.append(label);
    return input;
  });

  const statusClass = (status) => 'status-' + (status || 'unfinished').toLowerCase().replace(/[^a-z]+/g, '-');
  const xForValue = (value) => EDGE + (value - minYear) * yearWidth;

  function dateToYearValue(date) {
    const year = date.getFullYear();
    const start = new Date(year, 0, 1);
    const next = new Date(year + 1, 0, 1);
    return year + (date - start) / (next - start);
  }

  function parseDateValue(value, boundary) {
    const normalized = String(value || '').trim();
    if (/^\d{4}$/.test(normalized)) {
      return Number(normalized) + (boundary === 'end' ? 1 : 0);
    }
    const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return Number(normalized.slice(0, 4)) || minYear;
    const year = Number(match[1]);
    const instant = Date.UTC(year, Number(match[2]) - 1, Number(match[3]));
    const yearStart = Date.UTC(year, 0, 1);
    const nextYear = Date.UTC(year + 1, 0, 1);
    return year + (instant - yearStart) / (nextYear - yearStart);
  }

  function projectInterval(project, period, periodIndex) {
    const start = parseDateValue(period.dateStart, 'start');
    const end = period.dateEnd ? parseDateValue(period.dateEnd, 'end') : todayValue;
    const safeEnd = Math.max(start, end);
    return {
      ...project,
      _period: period,
      _periodIndex: periodIndex,
      _start: start,
      _end: safeEnd
    };
  }

  function assignLanes(items) {
    const laneEnds = [];
    return [...items]
      .map((project) => {
        const left = xForValue(project._start);
        const durationWidth = xForValue(project._end) - left;
        return {
          ...project,
          _left: left,
          _width: Math.max(MIN_RENDERED_BAR_WIDTH, durationWidth)
        };
      })
      .sort((a, b) => a._left - b._left || b._width - a._width)
      .map((project) => {
        const right = project._left + project._width;
        let lane = laneEnds.findIndex((lastRight) => (
          lastRight + BAR_HORIZONTAL_GAP <= project._left
        ));
        if (lane === -1) lane = laneEnds.length;
        laneEnds[lane] = right;
        return { project, lane };
      });
  }

  function renderTimeline() {
    hideTooltip();
    timeline.replaceChildren();

    const enabledStatuses = new Set(statusInputs.filter((input) => input.checked).map((input) => input.value));
    const enabledTypes = new Set(typeInputs.filter((input) => input.checked).map((input) => input.value));
    const enabledPlatforms = new Set(platformInputs.filter((input) => input.checked).map((input) => input.value));
    const enabledPositions = new Set(positionInputs.filter((input) => input.checked).map((input) => input.value));
    const enabledTags = new Set(tagInputs.filter((input) => input.checked).map((input) => input.value));
    const searchQuery = normalizeSearchText(searchInput.value);
    const allTypesEnabled = enabledTypes.size === typeInputs.length;
    const allPlatformsEnabled = enabledPlatforms.size === platformInputs.length;
    const allPositionsEnabled = enabledPositions.size === positionInputs.length;
    const tagFilteringEnabled = enabledTags.size > 0;
    const visibleProjects = datedProjects
      .filter((project) => enabledStatuses.has(project.status))
      .filter((project) => allTypesEnabled || enabledTypes.has(project.type))
      .filter((project) => allPlatformsEnabled || project.platform.some((platform) => enabledPlatforms.has(platform)))
      .filter((project) => allPositionsEnabled || project.position.some((position) => enabledPositions.has(position)))
      .filter((project) => !tagFilteringEnabled || [...enabledTags].every((tag) => project.tags.includes(tag)))
      .filter((project) => !searchQuery || project._searchText.includes(searchQuery));
    const visiblePeriods = visibleProjects.flatMap((project) => (
      project.periods.map((period, periodIndex) => projectInterval(project, period, periodIndex))
    ));
    const packedProjects = assignLanes(visiblePeriods);
    const laneCount = Math.max(1, ...packedProjects.map(({ lane }) => lane + 1));
    const timelineHeight = BAR_TOP + laneCount * BAR_STEP + 66;

    timeline.style.width = timelineWidth + 'px';
    timeline.style.height = timelineHeight + 'px';

    const axis = create('div', 'axis-line');
    axis.style.top = AXIS_Y + 'px';
    timeline.append(axis);

    years.forEach((year) => {
      const x = xForValue(year);
      const guide = create('div', 'year-guide');
      guide.style.left = x + 'px';
      timeline.append(guide);

      const tick = create('div', 'year-tick');
      tick.style.left = x + 'px';
      tick.style.top = AXIS_Y + 'px';
      timeline.append(tick);

      const label = create('div', 'year-label', String(year));
      label.style.left = x + 'px';
      label.style.top = AXIS_Y + 17 + 'px';
      timeline.append(label);
    });

    const todayX = xForValue(todayValue);
    const todayLine = create('div', 'today-line');
    todayLine.style.left = todayX + 'px';
    const todayLabel = create('div', 'today-label', 'TODAY · ' + formatToday(now).toUpperCase());
    todayLabel.style.left = todayX + 'px';
    timeline.append(todayLine, todayLabel);

    packedProjects.forEach(({ project, lane }) => {
      const left = project._left;
      const actualWidth = xForValue(project._end) - left;
      const width = project._width;
      const isCompact = actualWidth < MIN_BAR_WIDTH;
      const button = create(
        'button',
        'range-project ' + statusClass(project.status) +
          (project.tags.includes('highlight') ? ' highlight-project' : '') +
          (project.icon ? ' has-icon' : '') +
          (isCompact ? ' is-compact' : '')
      );
      button.type = 'button';
      button.style.left = left + 'px';
      button.style.top = BAR_TOP + lane * BAR_STEP + 'px';
      button.style.width = width + 'px';
      button.setAttribute('aria-label', project.title + ', ' + formatPeriod(project._period));

      if (project.icon) {
        const icon = buildImage(project.icon, 'range-icon', '');
        if (icon) button.append(icon);
      }
      button.append(create('span', 'range-title', project.title));
      bindTooltip(button, project);
      timeline.append(button);
    });

    if (!visiblePeriods.length) {
      const emptyState = create('div', 'timeline-empty', 'No projects match the selected filters.');
      emptyState.style.top = BAR_TOP + 12 + 'px';
      timeline.append(emptyState);
    }

    document.getElementById('project-count').textContent = visibleProjects.length + ' of ' + projects.length + ' projects';
    timeline.setAttribute(
      'aria-label',
      'Horizontal project timeline by year. ' + visibleProjects.length + ' projects across ' +
        visiblePeriods.length + ' periods displayed.'
    );
    requestAnimationFrame(syncNavigator);
  }

  function formatToday(date) {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    }).format(date);
  }

  function formatInputDate(value) {
    const normalized = String(value || '').trim();
    if (/^\d{4}$/.test(normalized)) return normalized;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return normalized;
    const date = new Date(normalized + 'T00:00:00Z');
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC'
    }).format(date);
  }

  function formatPeriod(period) {
    const start = formatInputDate(period.dateStart);
    const end = period.dateEnd ? formatInputDate(period.dateEnd) : 'Present';
    return start + ' - ' + end;
  }

  const fieldLabels = [
    ['company', 'Company'],
    ['platform', 'Platform'],
    ['geo', 'Geography'],
    ['type', 'Type'],
    ['genre', 'Genre'],
    ['status', 'Status'],
    ['engine', 'Engine'],
    ['position', 'Position']
  ];

  function renderTooltip(project) {
    tooltip.replaceChildren();
    const head = create('div', 'tooltip-head');
    const identity = create('div', 'tooltip-identity');

    if (project.icon) {
      const icon = buildImage(project.icon, 'tooltip-icon', '');
      if (icon) identity.append(icon);
    }

    const headCopy = create('div', 'tooltip-head-copy');
    headCopy.append(create('h3', 'tooltip-title', project.title));
    identity.append(headCopy);
    const dates = create('div', 'tooltip-dates');
    project.periods.forEach((period) => {
      dates.append(create('div', 'tooltip-date', formatPeriod(period)));
    });
    head.append(identity, dates);
    tooltip.append(head);

    const availableFields = fieldLabels.filter(([key]) => (
      Array.isArray(project[key]) ? project[key].length : project[key]
    ));
    if (availableFields.length) {
      const grid = create('div', 'tooltip-grid');
      availableFields.forEach(([key, label]) => {
        const field = create('div', 'tooltip-field');
        field.append(create('span', '', label));
        if (key === 'platform' || key === 'position') {
          const tags = create('div', 'tooltip-tags');
          project[key].forEach((tag) => tags.append(create('strong', 'tooltip-tag', tag)));
          field.append(tags);
        } else {
          field.append(create('strong', '', project[key]));
        }
        grid.append(field);
      });
      tooltip.append(grid);
    }

    if (project.description) {
      const description = buildDescription(project.description, project.title);
      if (description) tooltip.append(description);
    }
    if (project.links.length) tooltip.append(buildLinks(project.links));
  }

  function buildDescription(value, title) {
    const block = create('div', 'tooltip-description-block');
    const imagePattern = /<image\s*=\s*(["'])(.*?)\1\s*>/gi;
    let cursor = 0;
    let match;

    const appendText = (text) => {
      const normalized = text.trim();
      if (normalized) block.append(create('p', 'tooltip-description-text', normalized));
    };

    while ((match = imagePattern.exec(value)) !== null) {
      appendText(value.slice(cursor, match.index));
      const image = buildImage(match[2].trim(), 'description-image', title + ' project image');
      if (image) {
        const figure = create('figure', 'description-media');
        image.addEventListener('error', () => { figure.hidden = true; });
        figure.append(image);
        block.append(figure);
      }
      cursor = imagePattern.lastIndex;
    }
    appendText(value.slice(cursor));
    return block.childElementCount ? block : null;
  }

  function safeAssetPath(value) {
    const normalized = String(value || '').trim();
    if (!normalized) return '';
    try {
      const resolved = new URL(normalized, window.location.href);
      return ['http:', 'https:', 'file:'].includes(resolved.protocol) ? normalized : '';
    } catch {
      return '';
    }
  }

  function buildImage(path, className, alt) {
    const safePath = safeAssetPath(path);
    if (!safePath) return null;
    const image = create('img', className);
    image.src = safePath;
    image.alt = alt;
    image.loading = 'lazy';
    image.decoding = 'async';
    image.addEventListener('error', () => { image.hidden = true; });
    return image;
  }

  function buildLinks(links) {
    const wrap = create('div', 'tooltip-links');
    links.forEach((value) => {
      let url;
      try { url = new URL(value); } catch { return; }
      if (!['http:', 'https:'].includes(url.protocol)) return;
      const link = create('a', 'preview-link');
      link.href = url.href;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';

      const videoId = getYouTubeId(url);
      if (videoId) {
        const image = create('img', 'preview-image');
        image.src = 'https://i.ytimg.com/vi/' + videoId + '/mqdefault.jpg';
        image.alt = '';
        link.append(image);
      } else {
        const initials = url.hostname.replace(/^www\./, '').split('.')[0].slice(0, 2).toUpperCase();
        link.append(create('div', 'preview-fallback', initials));
      }

      const copy = create('div', 'preview-copy');
      copy.append(create('strong', '', videoId ? 'Watch video' : 'Open project'));
      copy.append(create('span', '', url.hostname.replace(/^www\./, '')));
      link.append(copy, create('span', 'preview-arrow', '↗'));
      wrap.append(link);
    });
    return wrap;
  }

  function getYouTubeId(url) {
    if (url.hostname === 'youtu.be') return url.pathname.slice(1).split('/')[0];
    if (url.hostname.endsWith('youtube.com')) return url.searchParams.get('v');
    return '';
  }

  function bindTooltip(anchor, project) {
    anchor.addEventListener('mouseenter', () => showTooltip(anchor, project));
    anchor.addEventListener('mouseleave', scheduleHide);
    anchor.addEventListener('focus', () => showTooltip(anchor, project));
    anchor.addEventListener('blur', scheduleHide);
    anchor.addEventListener('click', (event) => {
      event.stopPropagation();
      showTooltip(anchor, project);
    });
  }

  function showTooltip(anchor, project) {
    window.clearTimeout(hideTimer);
    activeAnchor = anchor;
    renderTooltip(project);
    tooltip.hidden = false;
    requestAnimationFrame(() => {
      placeTooltip(anchor);
      tooltip.classList.add('is-visible');
    });
  }

  function placeTooltip(anchor) {
    const anchorRect = anchor.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    const gap = 12;
    let left = anchorRect.left + anchorRect.width / 2 - tooltipRect.width / 2;
    left = Math.max(12, Math.min(left, window.innerWidth - tooltipRect.width - 12));
    let top = anchorRect.bottom + gap;
    if (top + tooltipRect.height > window.innerHeight - 12) top = anchorRect.top - tooltipRect.height - gap;
    top = Math.max(12, Math.min(top, window.innerHeight - tooltipRect.height - 12));
    tooltip.style.left = left + 'px';
    tooltip.style.top = top + 'px';
  }

  function scheduleHide() {
    window.clearTimeout(hideTimer);
    hideTimer = window.setTimeout(() => {
      if (!tooltip.matches(':hover') && document.activeElement !== activeAnchor) hideTooltip();
    }, 130);
  }

  function hideTooltip() {
    window.clearTimeout(hideTimer);
    tooltip.classList.remove('is-visible');
    activeAnchor = null;
    window.setTimeout(() => {
      if (!tooltip.classList.contains('is-visible')) tooltip.hidden = true;
    }, 170);
  }

  document.getElementById('nav-start').textContent = minYear;
  document.getElementById('nav-end').textContent = maxYear;
  tooltip.addEventListener('mouseenter', () => window.clearTimeout(hideTimer));
  tooltip.addEventListener('mouseleave', scheduleHide);
  document.addEventListener('pointerdown', (event) => {
    if (!tooltip.contains(event.target) && !event.target.closest('.range-project')) hideTooltip();
    if (!positionDropdown.contains(event.target)) positionDropdown.open = false;
  });
  positionDropdown.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !positionDropdown.open) return;
    event.preventDefault();
    positionDropdown.open = false;
    positionSummary.focus();
  });
  window.addEventListener('resize', () => activeAnchor && placeTooltip(activeAnchor));
  scroller.addEventListener('scroll', () => {
    const max = Math.max(0, scroller.scrollWidth - scroller.clientWidth);
    navigator.max = String(max);
    navigator.value = String(scroller.scrollLeft);
    if (activeAnchor) placeTooltip(activeAnchor);
  }, { passive: true });

  const syncNavigator = () => {
    navigator.max = String(Math.max(0, scroller.scrollWidth - scroller.clientWidth));
    navigator.value = String(scroller.scrollLeft);
  };

  const updateZoomControls = () => {
    zoomOutButton.disabled = yearWidth <= MIN_YEAR_WIDTH;
    zoomInButton.disabled = yearWidth >= MAX_YEAR_WIDTH;
  };

  const zoomTimeline = (factor) => {
    const nextYearWidth = Math.max(MIN_YEAR_WIDTH, Math.min(MAX_YEAR_WIDTH, yearWidth * factor));
    if (nextYearWidth === yearWidth) return;

    const leftValue = minYear + (scroller.scrollLeft - EDGE) / yearWidth;
    yearWidth = nextYearWidth;
    timelineWidth = EDGE * 2 + years.length * yearWidth;
    renderTimeline();

    requestAnimationFrame(() => {
      scroller.scrollLeft = xForValue(leftValue);
      syncNavigator();
      updateZoomControls();
    });
  };

  navigator.addEventListener('input', () => { scroller.scrollLeft = Number(navigator.value); });
  zoomOutButton.addEventListener('click', () => zoomTimeline(0.5));
  zoomInButton.addEventListener('click', () => zoomTimeline(2));
  window.addEventListener('resize', syncNavigator);
  statusInputs.forEach((input) => input.addEventListener('change', renderTimeline));
  typeInputs.forEach((input) => input.addEventListener('change', renderTimeline));
  platformInputs.forEach((input) => input.addEventListener('change', renderTimeline));
  positionInputs.forEach((input) => input.addEventListener('change', () => {
    updatePositionSummary();
    renderTimeline();
  }));
  tagInputs.forEach((input) => input.addEventListener('change', renderTimeline));
  searchInput.addEventListener('input', renderTimeline);
  renderTimeline();
  updateZoomControls();
  requestAnimationFrame(() => {
    scroller.scrollLeft = 0;
    syncNavigator();
  });

  let drag = null;
  scroller.addEventListener('pointerdown', (event) => {
    if (event.target.closest('button, a, input')) return;
    drag = { x: event.clientX, scrollLeft: scroller.scrollLeft };
    scroller.classList.add('is-dragging');
    scroller.setPointerCapture(event.pointerId);
  });
  scroller.addEventListener('pointermove', (event) => {
    if (!drag) return;
    scroller.scrollLeft = drag.scrollLeft - (event.clientX - drag.x);
  });
  const endDrag = () => {
    drag = null;
    scroller.classList.remove('is-dragging');
  };
  scroller.addEventListener('pointerup', endDrag);
  scroller.addEventListener('pointercancel', endDrag);
  scroller.addEventListener('wheel', (event) => {
    const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
    if (!delta) return;

    const maxScroll = Math.max(0, scroller.scrollWidth - scroller.clientWidth);
    const nextScroll = Math.max(0, Math.min(maxScroll, scroller.scrollLeft + delta));
    if (nextScroll === scroller.scrollLeft) return;

    event.preventDefault();
    scroller.scrollLeft = nextScroll;
  }, { passive: false });
})();
