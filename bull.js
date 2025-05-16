// Variables globales pour les données et la visualisation
let data = [];
let desc = [];
let minYear = 9999;
let maxYear = 0;
let radius, node, label, color, statusColor, g;

// Fonction pour nettoyer les guillemets et caractères problématiques dans les champs CSV
function cleanCSVField(field) {
  return field
    .replace(/^"(.*)"$/, '$1')
    .replace(/"/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Fonction pour échapper les valeurs dans les sélecteurs CSS
function escapeCSSSelector(value) {
  return value.replace(/"/g, '\\"').replace(/'/g, "\\'").replace(/\s/g, '\\ ');
}

// Fonction pour parser le CSV en respectant les guillemets
function parseCSV(csvData) {
  const lines = csvData.split("\n").filter(line => line.trim() !== "");
  if (lines.length < 2) {
    console.error("CSV vide ou mal formé");
    return [];
  }

  const headers = lines[0].split(",").map(cleanCSVField);
  const result = [];

  function parseCSVLine(line) {
    const fields = [];
    let currentField = '';
    let insideQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        insideQuotes = !insideQuotes;
        continue;
      }
      if (char === ',' && !insideQuotes) {
        fields.push(cleanCSVField(currentField));
        currentField = '';
        continue;
      }
      currentField += char;
    }
    fields.push(cleanCSVField(currentField));
    return fields;
  }

  for (let i = 1; i < lines.length; i++) {
    const row = parseCSVLine(lines[i]);
    if (row.length < headers.length) continue;

    const entry = {};
    headers.forEach((header, index) => {
      if (header === "Dev (s)") {
        entry["devTeam"] = row[index] ? row[index].split(";").map(s => s.trim()) : [];
      } else if (header === "Collaborator 1" || header === "Collaborator 2") {
        entry["Collaborators"] = entry["Collaborators"] || [];
        if (row[index]) entry["Collaborators"].push(row[index]);
      } else if (header === "Description") {
        entry["Description"] = row[index] || "";
      } else {
        entry[header] = row[index] || "";
      }
    });
    result.push(entry);
  }

  return result;
}

// Fonction pour charger le CSV
function fetchCSV() {
  fetch('projects_designlab - DLX Project LIST.csv')
    .then(response => {
      if (!response.ok) throw new Error(`Erreur HTTP ${response.status}`);
      return response.text();
    })
    .then(csvData => {
      console.log('Données CSV brutes:', csvData);
      const parsedData = parseCSV(csvData);
      console.log('Données parsées:', parsedData);

      data = parsedData.map(entry => ({
        name: entry["Project name"] || "",
        Initiative: entry["Initiative"] || "",
        fundings: entry["Funding"] || "",
        devTeam: entry["devTeam"] || [],
        Collaborators: entry["Collaborators"] || [],
        Topic: entry["Topic"] || "",
        Outcome: entry["Outcome"] || "",
        Status: entry["Status"] || "",
        Start: entry["Start"] || "",
        End: entry["End"] || "",
        MonthLenght: entry["Lenght"] || ""
      }));

      minYear = 9999;
      maxYear = 0;
      parsedData.forEach(entry => {
        const [startMonthStr, startYearStr] = entry.Start.split("/");
        const [endMonthStr, endYearStr] = entry.End ? entry.End.split("/") : ["", ""];
        const startYear = parseInt(startYearStr);
        const endYear = parseInt(endYearStr) || (entry.Status === "Active" ? new Date().getFullYear() : startYear);
        if (!isNaN(startYear) && startYear < minYear) minYear = startYear;
        if (!isNaN(endYear) && endYear > maxYear) maxYear = endYear;
      });

      desc = parsedData.map(entry => ({
        name: entry["Project name"] || "",
        link: "",
        desc: entry["Description"] || ""
      }));

      console.log('Data finale:', data);
      console.log('Desc finale:', desc);
      console.log('Min Year:', minYear, 'Max Year:', maxYear);

      if (data.length === 0) {
        console.error("Aucune donnée valide chargée");
        return;
      }

      initializeVisualization();
    })
    .catch(error => console.error('Erreur lors du chargement du CSV:', error));
}

// Variables globales pour les filtres
let filters = {};
let activeFilters = {
  Topic: new Set(),
  Outcome: new Set(),
  Status: new Set()
};

// Fonction pour mettre à jour les cercles et les comptes selon les filtres
function updateFilters() {
  activeFilters.Topic.clear();
  activeFilters.Outcome.clear();
  activeFilters.Status.clear();

  d3.selectAll("#filters input:checked").each(function() {
    const key = d3.select(this).attr("data-key");
    const value = d3.select(this).attr("value");
    activeFilters[key].add(value);
  });

  console.log("Filtres actifs:", {
    Topic: Array.from(activeFilters.Topic),
    Outcome: Array.from(activeFilters.Outcome),
    Status: Array.from(activeFilters.Status)
  });

  Object.entries(filters).forEach(([key, options]) => {
    options.forEach(option => {
      const count = countProjectsForFilter(key, option);
      console.log(`Compte pour ${key} - ${option.value}: ${count}`);
      try {
        const input = d3.select(`#filters input[value="${escapeCSSSelector(option.value)}"][data-key="${key}"]`);
        if (input.node()) {
          input.node().parentNode.querySelector(".count").textContent = count;
        } else {
          console.warn(`Input non trouvé pour ${key} - ${option.value}`);
        }
      } catch (e) {
        console.error(`Erreur avec le sélecteur pour ${key} - ${option.value}:`, e);
      }
    });
  });

  const filteredData = data.filter(d => {
    const topicPass = activeFilters.Topic.size === 0 || activeFilters.Topic.has(d.Topic);
    const outcomePass = activeFilters.Outcome.size === 0 || activeFilters.Outcome.has(d.Outcome);
    const statusPass = activeFilters.Status.size === 0 || activeFilters.Status.has(d.Status);
    const slider = document.getElementById('slider');
    let yearPass = true;
    if (slider && slider.noUiSlider) {
      const [min, max] = slider.noUiSlider.get().map(Number);
      const startYear = parseInt(d.Start.split("/")[1]);
      const endYear = d.End ? parseInt(d.End.split("/")[1]) : (d.Status === "Active" ? new Date().getFullYear() : startYear);
      yearPass = startYear <= max && endYear >= min;
    }
    return topicPass && outcomePass && statusPass && yearPass;
  });

  console.log("Projets filtrés:", filteredData.map(d => d.name));
  console.log("Utilisation de radius dans updateFilters:", radius);
  positionCirclesRandomly(filteredData, radius);

  node = g.selectAll("circle")
    .data(filteredData, d => d.name)
    .join(
      enter => enter.append("circle")
        .attr("r", 0)
        .attr("cx", d => isNaN(d.x) ? 0 : d.x)
        .attr("cy", d => isNaN(d.y) ? 0 : d.y)
        .attr("fill", d => `url(#image-${d.name.replace(/\s+/g, '-')})`)
        .attr("stroke", d => color(d.Topic))
        .attr("stroke-width", 8)
        .attr("cursor", "pointer")
        .on("mouseover", function(event, d) {
          d3.select(this).transition().duration(200).attr("r", d.radius * 1.1);
        })
        .on("mouseout", function(event, d) {
          d3.select(this).transition().duration(200).attr("r", d.radius);
        })
        .on("click", (event, d) => {
          const descObj = desc.find(p => p.name === d.name);
          const description = descObj && descObj.desc ? descObj.desc : "Aucune description disponible.";
          const endYear = d.Status === "Active" && !d.End ? "now" : d.End;
          const collaboratorsList = d.Collaborators.map(c => `<li>${c}</li>`).join("");
          const devTeamList = d.devTeam.map(dt => `<li>${dt}</li>`).join("");
          const linkContent = descObj && descObj.link ? `<p class="link"><strong>Link:</strong> <a href="${descObj.link}" target="_blank">${descObj.link}</a></p>` : "";
          const popupContent = `
            <div class="project-info">
              <p><strong>Initiative:</strong> ${d.Initiative}</p>
              <p><strong>Funding:</strong> ${d.fundings}</p>
              <p><strong>Years:</strong> ${d.Start} - ${endYear}</p>
              <p><strong>Development Team:</strong></p>
              <ul>${devTeamList || "<li>Aucun développeur</li>"}</ul>
              <p><strong>Collaborators:</strong></p>
              <ul>${collaboratorsList || "<li>Aucun collaborateur</li>"}</ul>
              <p><strong>Status:</strong> ${d.Status}</p>
            </div>
            <div class="description">${description}${linkContent}</div>
          `;
          d3.select("#popup-title").text(d.name);
          d3.select("#popup-content").html(popupContent);
          d3.select("#popup").classed("show", true);
          d3.select("#popup-overlay").classed("show", true);
        })
        .transition().duration(500)
        .attr("r", d => d.radius),
      update => update
        .transition().duration(500)
        .attr("cx", d => isNaN(d.x) ? 0 : d.x)
        .attr("cy", d => isNaN(d.y) ? 0 : d.y)
        .attr("r", d => d.radius),
      exit => exit.transition().duration(500).attr("r", 0).remove()
    );

  label = g.selectAll("g.project-label")
    .data(filteredData, d => d.name)
    .join(
      enter => {
        const gEnter = enter.append("g")
          .attr("class", "project-label")
          .attr("transform", d => `translate(${isNaN(d.x) ? 0 : d.x},${isNaN(d.y) ? 0 : d.y})`)
          .attr("opacity", 0);

        gEnter.each(function(d) {
          const fontSize = Math.max(10, d.radius / 6);
          const maxWidth = 2 * d.radius - 10;
          const words = d.name.split(/\s+/);
          let lines = [];
          let line = '';

          words.forEach(word => {
            const testLine = line + (line ? ' ' : '') + word;
            const testWidth = testLine.length * fontSize * 0.95;
            if (testWidth <= maxWidth - 10) {
              line = testLine;
            } else {
              if (line) lines.push(line);
              if (word.length * fontSize * 0.95 > maxWidth - 10) {
                let remaining = word;
                while (remaining.length > 0) {
                  let i = Math.floor((maxWidth - 10) / (fontSize * 0.95));
                  if (i >= remaining.length) {
                    lines.push(remaining);
                    remaining = '';
                  } else {
                    lines.push(remaining.slice(0, i));
                    remaining = remaining.slice(i);
                  }
                }
              } else {
                line = word;
              }
            }
          });
          if (line) lines.push(line);

          const rectHeight = Math.max(24, lines.length * fontSize * 1.2 + 10);
          const textWidth = d.name.length * fontSize * 0.95;
          const rectWidth = Math.min(textWidth + 10, maxWidth);

          d3.select(this).append("rect")
            .attr("x", -rectWidth / 2)
            .attr("y", -rectHeight / 2)
            .attr("width", rectWidth)
            .attr("height", rectHeight)
            .attr("fill", d => color(d.Topic))
            .attr("rx", 4)
            .attr("pointer-events", "none");

          const text = d3.select(this).append("text")
            .attr("text-anchor", "middle")
            .attr("font-size", fontSize + "px")
            .attr("fill", d => statusColor(d.Status))
            .attr("y", -rectHeight / 2 + fontSize * 0.6)
            .attr("pointer-events", "none");

          lines.forEach((line, i) => {
            text.append("tspan")
              .attr("x", 0)
              .attr("dy", i === 0 ? `${fontSize * 0.35}px` : `${fontSize * 1.2}px`)
              .text(line);
          });
        });

        return gEnter.transition().duration(500).attr("opacity", 1);
      },
      update => update
        .transition().duration(500)
        .attr("transform", d => `translate(${isNaN(d.x) ? 0 : d.x},${isNaN(d.y) ? 0 : d.y})`)
        .each(function(d) {
          const fontSize = Math.max(10, d.radius / 6);
          const maxWidth = 2 * d.radius - 10;
          const textWidth = d.name.length * fontSize * 0.95;
          const rectWidth = Math.min(textWidth + 10, maxWidth);

          const words = d.name.split(/\s+/);
          let lines = [];
          let line = '';

          words.forEach(word => {
            const testLine = line + (line ? ' ' : '') + word;
            const testWidth = testLine.length * fontSize * 0.95;
            if (testWidth <= maxWidth - 10) {
              line = testLine;
            } else {
              if (line) lines.push(line);
              if (word.length * fontSize * 0.95 > maxWidth - 10) {
                let remaining = word;
                while (remaining.length > 0) {
                  let i = Math.floor((maxWidth - 10) / (fontSize * 0.95));
                  if (i >= remaining.length) {
                    lines.push(remaining);
                    remaining = '';
                  } else {
                    lines.push(remaining.slice(0, i));
                    remaining = remaining.slice(i);
                  }
                }
              } else {
                line = word;
              }
            }
          });
          if (line) lines.push(line);

          const rectHeight = Math.max(24, lines.length * fontSize * 1.2 + 10);

          d3.select(this).select("rect")
            .attr("x", -rectWidth / 2)
            .attr("y", -rectHeight / 2)
            .attr("width", rectWidth)
            .attr("height", rectHeight)
            .attr("fill", color(d.Topic));

          const text = d3.select(this).select("text");
          text.selectAll("tspan").remove();
          text.attr("font-size", fontSize + "px")
            .attr("fill", statusColor(d.Status))
            .attr("y", -rectHeight / 2 + fontSize * 0.6);

          lines.forEach((line, i) => {
            text.append("tspan")
              .attr("x", 0)
              .attr("dy", i === 0 ? `${fontSize * 0.35}px` : `${fontSize * 1.2}px`)
              .text(line);
          });
        }),
      exit => exit.transition().duration(500).attr("opacity", 0).remove()
    );

  console.log("SVG mis à jour avec", filteredData.length, "projets");
}

// Fonction pour calculer le nombre de projets pour une option
function countProjectsForFilter(key, option) {
  return data.filter(d => {
    let pass = filters[key].find(f => f.value === option.value).test(d);
    if (key !== "Topic" && activeFilters.Topic.size > 0) {
      pass = pass && Array.from(activeFilters.Topic).some(value => filters.Topic.find(f => f.value === value).test(d));
    }
    if (key !== "Outcome" && activeFilters.Outcome.size > 0) {
      pass = pass && Array.from(activeFilters.Outcome).some(value => filters.Outcome.find(f => f.value === value).test(d));
    }
    if (key !== "Status" && activeFilters.Status.size > 0) {
      pass = pass && Array.from(activeFilters.Status).some(value => filters.Status.find(f => f.value === value).test(d));
    }
    const slider = document.getElementById('slider');
    if (slider && slider.noUiSlider) {
      const [min, max] = slider.noUiSlider.get().map(Number);
      const startYear = parseInt(d.Start.split("/")[1]);
      const endYear = d.End ? parseInt(d.End.split("/")[1]) : (d.Status === "Active" ? new Date().getFullYear() : startYear);
      pass = pass && startYear <= max && endYear >= min;
    }
    return pass;
  }).length;
}

// Fonction pour positionner les cercles de manière fixe, collés sans superposition
function positionCirclesRandomly(data, radius) {
  console.log("Positionnement fixe des cercles pour", data.length, "projets");
  const topics = [...new Set(data.map(d => d.Topic))].sort();
  const topicAngles = {};

  // Assigner des plages angulaires pour chaque Topic
  const anglePerTopic = (2 * Math.PI) / Math.max(1, topics.length);
  topics.forEach((topic, i) => {
    const startAngle = i * anglePerTopic;
    const endAngle = (i + 1) * anglePerTopic;
    topicAngles[topic] = { startAngle, endAngle };
    console.log(`Topic ${topic}: angle de ${startAngle * 180 / Math.PI}° à ${endAngle * 180 / Math.PI}°`);
  });

  // Assurer que chaque projet a un rayon valide
  data.forEach(d => {
    if (!d.radius || isNaN(d.radius)) {
      console.warn(`Rayon invalide pour le projet ${d.name}:`, d.radius);
      d.radius = 80;
    }
  });

  // Grouper les projets par Topic
  const projectsByTopic = {};
  topics.forEach(topic => {
    projectsByTopic[topic] = data.filter(d => d.Topic === topic).sort((a, b) => a.name.localeCompare(b.name));
  });

  const placed = [];

  // Positionner chaque projet dans son secteur avec une simulation de force intra-secteur
  Object.entries(projectsByTopic).forEach(([topic, projects]) => {
    const { startAngle, endAngle } = topicAngles[topic];
    const midAngle = (startAngle + endAngle) / 2;

    // Centre du secteur
    const baseDistance = radius * 0.5;
    const baseX = baseDistance * Math.cos(midAngle);
    const baseY = baseDistance * Math.sin(midAngle);

    // Initialiser les positions autour du centre
    projects.forEach((d, i) => {
      const angle = midAngle + (i / Math.max(1, projects.length - 1)) * (endAngle - startAngle);
      const r = d.radius + 50 + (i * 50);
      d.x = baseX + r * Math.cos(angle);
      d.y = baseY + r * Math.sin(angle);
    });

    // Simulation de force intra-secteur
    const iterations = 100;
    const attractionStrength = 0.05;
    const repulsionStrength = 1.0;

    for (let iter = 0; iter < iterations; iter++) {
      projects.forEach(d => {
        let fx = 0;
        let fy = 0;

        // Attraction vers le centre du secteur
        const dxCenter = baseX - d.x;
        const dyCenter = baseY - d.y;
        fx += dxCenter * attractionStrength;
        fy += dyCenter * attractionStrength;

        // Répulsion entre bulles du même Topic
        projects.forEach(other => {
          if (other !== d) {
            const dx = d.x - other.x;
            const dy = d.y - other.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            const minDistance = d.radius + other.radius;
            if (distance < minDistance && distance > 0) {
              const push = (minDistance - distance) * repulsionStrength / distance;
              fx += dx * push;
              fy += dy * push;
            }
          }
        });

        // Mettre à jour la position
        d.x += fx;
        d.y += fy;

        // Contraindre dans les limites du SVG
        const distanceFromCenter = Math.sqrt(d.x * d.x + d.y * d.y);
        if (distanceFromCenter + d.radius > radius - 50) {
          const scale = (radius - 50 - d.radius) / distanceFromCenter;
          d.x *= scale;
          d.y *= scale;
        }
      });
    }

    placed.push(...projects);
  });

  // Simulation de force inter-secteur pour éviter les collisions entre Topics
  const interSectorIterations = 50;
  const interSectorRepulsionStrength = 0.5;

  for (let iter = 0; iter < interSectorIterations; iter++) {
    placed.forEach(d => {
      let fx = 0;
      let fy = 0;

      // Vérifier les collisions avec toutes les autres bulles
      placed.forEach(other => {
        if (other !== d) {
          const dx = d.x - other.x;
          const dy = d.y - other.y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          const minDistance = d.radius + other.radius;
          if (distance < minDistance && distance > 0) {
            const push = (minDistance - distance) * interSectorRepulsionStrength / distance;
            fx += dx * push;
            fy += dy * push;
          }
        }
      });

      // Mettre à jour la position
      d.x += fx;
      d.y += fy;

      // Contraindre dans les limites du SVG
      const distanceFromCenter = Math.sqrt(d.x * d.x + d.y * d.y);
      if (distanceFromCenter + d.radius > radius - 50) {
        const scale = (radius - 50 - d.radius) / distanceFromCenter;
        d.x *= scale;
        d.y *= scale;
      }
    });
  }

  // Vérifier les collisions finales
  for (let i = 0; i < placed.length; i++) {
    for (let j = i + 1; j < placed.length; j++) {
      const d1 = placed[i];
      const d2 = placed[j];
      const dx = d1.x - d2.x;
      const dy = d1.y - d2.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const minDistance = d1.radius + d2.radius;
      if (distance < minDistance - 5) {
        console.warn(`Collision détectée entre ${d1.name} (${d1.Topic}) et ${d2.name} (${d2.Topic}): distance=${distance}, minDistance=${minDistance}`);
      }
    }
  }

  // Vérifier que les coordonnées sont valides
  placed.forEach(d => {
    if (isNaN(d.x) || isNaN(d.y)) {
      console.error(`Coordonnées NaN pour projet ${d.name}`);
      d.x = 0;
      d.y = 0;
    }
  });

  console.log("Positions calculées:", placed.map(d => ({ name: d.name, x: d.x, y: d.y, topic: d.Topic, radius: d.radius })));
}

// Fonction pour initialiser le slider
function initSlider(min, max) {
  const slider = document.getElementById('slider');
  const minSpan = document.getElementById('min');
  const maxSpan = document.getElementById('max');

  if (!slider) {
    console.error("Élément #slider introuvable dans le DOM");
    return;
  }
  if (!minSpan || !maxSpan) {
    console.error("Éléments #min ou #max introuvables pour afficher les valeurs du slider");
    return;
  }
  if (isNaN(min) || isNaN(max) || min >= max) {
    console.error(`Valeurs invalides pour le slider: min=${min}, max=${max}`);
    return;
  }

  console.log("Initialisation du slider avec min:", min, "max:", max);

  try {
    noUiSlider.create(slider, {
      start: [min, max],
      connect: true,
      range: {
        'min': min,
        'max': max
      },
      step: 1,
      format: {
        to: value => Math.round(value),
        from: value => Number(value)
      }
    });

    slider.noUiSlider.on('update', function(values, handle) {
      minSpan.textContent = values[0];
      maxSpan.textContent = values[1];
      console.log("Slider mis à jour: min =", values[0], "max =", values[1]);
      updateFilters();
    });

    console.log("Slider initialisé avec succès");
  } catch (e) {
    console.error("Erreur lors de l'initialisation du slider:", e);
  }
}

// Fonction principale de visualisation
function initializeVisualization() {
  data.forEach(d => {
    let endYear = d.End;
    if (!endYear) {
      if (d.Status === "Complete") {
        const startDate = new Date(d.Start);
        endYear = `${startDate.getMonth() + 1}/${startDate.getFullYear() + 2}`;
      } else if (d.Status === "Active") {
        const today = new Date();
        endYear = `${today.getMonth() + 1}/${today.getFullYear()}`;
      } else {
        endYear = d.Start;
      }
    }

    let duration;
    try {
      const startDate = new Date(d.Start);
      const endDate = new Date(endYear);
      duration = (endDate.getFullYear() - startDate.getFullYear()) * 12 + (endDate.getMonth() - startDate.getMonth());
      duration = Math.max(0, duration || parseInt(d.MonthLenght) || 1);
    } catch (e) {
      console.warn(`Erreur de calcul de durée pour le projet ${d.name}: Start=${d.Start}, End=${endYear}, MonthLenght=${d.MonthLenght}`);
      duration = 1;
    }
    d.duration = duration;
  });

  const maxDuration = d3.max(data, d => d.duration) || 1;
  if (isNaN(maxDuration) || maxDuration <= 0) {
    console.error("maxDuration invalide:", maxDuration);
    data.forEach(d => d.radius = 80);
  } else {
    const radiusScale = d3.scaleLinear()
      .domain([0, maxDuration])
      .range([80, 160]);
    data.forEach(d => {
      d.radius = radiusScale(d.duration);
      if (isNaN(d.radius)) {
        console.warn(`Rayon NaN pour le projet ${d.name}: duration=${d.duration}`);
        d.radius = 80;
      }
    });
  }

  filters = {
    Topic: [...new Set(data.map(d => d.Topic))].sort().map(value => ({
      label: value,
      value: value,
      test: d => d.Topic === value
    })),
    Outcome: [...new Set(data.map(d => d.Outcome))].sort().map(value => ({
      label: value,
      value: value,
      test: d => d.Outcome === value
    })),
    Status: [...new Set(data.map(d => d.Status))].sort().map(value => ({
      label: value,
      value: value,
      test: d => d.Status === value
    }))
  };

  console.log('Valeurs des filtres:', {
    Topic: filters.Topic.map(f => f.value),
    Outcome: filters.Outcome.map(f => f.value),
    Status: filters.Status.map(f => f.value)
  });

  color = d3.scaleOrdinal()
    .domain([...new Set(data.map(d => d.Topic))])
    .range(["#0B8BEE", "#FFCD00", "#35CA00", "#D71131", "#BC6ACC", "#5BDEFF", "#EFA0AD"]);

  statusColor = d3.scaleOrdinal()
    .domain(["Active", "Complete", "Inactive"])
    .range(["#FFFFFF", "#000000", "#000000"]);

  radius = 1800;
  const width = radius * 2;
  const height = radius * 2;
  console.log("Radius défini dans initializeVisualization:", radius);

  const svg = d3.select("#chart")
    .append("svg")
    .attr("width", width)
    .attr("height", height)
    .attr("viewBox", `-${radius} -${radius} ${width} ${height}`)
    .attr("preserveAspectRatio", "xMidYMid meet");

  svg.append("clipPath")
    .attr("id", "circle-clip")
    .append("circle")
    .attr("cx", 0)
    .attr("cy", 0)
    .attr("r", radius);

  data.forEach(d => {
    svg.append("defs")
      .append("pattern")
      .attr("id", `image-${d.name.replace(/\s+/g, '-')}`)
      .attr("width", "100%")
      .attr("height", "100%")
      .attr("patternContentUnits", "objectBoundingBox")
      .append("image")
      .attr("xlink:href", `image/${d.name}.png`)
      .attr("width", 1)
      .attr("height", 1)
      .attr("preserveAspectRatio", "xMidYMid slice");
  });

  g = svg.append("g")
    .attr("clip-path", "url(#circle-clip)");

  positionCirclesRandomly(data, radius);

  node = g.selectAll("circle")
    .data(data, d => d.name)
    .join("circle")
    .attr("r", d => d.radius)
    .attr("cx", d => isNaN(d.x) ? 0 : d.x)
    .attr("cy", d => isNaN(d.y) ? 0 : d.y)
    .attr("fill", d => `url(#image-${d.name.replace(/\s+/g, '-')})`)
    .attr("stroke", d => color(d.Topic))
    .attr("stroke-width", 8)
    .attr("cursor", "pointer")
    .on("mouseover", function(event, d) {
      d3.select(this).transition().duration(200).attr("r", d.radius * 1.1);
    })
    .on("mouseout", function(event, d) {
      d3.select(this).transition().duration(200).attr("r", d.radius);
    })
    .on("click", (event, d) => {
      const descObj = desc.find(p => p.name === d.name);
      const description = descObj && descObj.desc ? descObj.desc : "Aucune description disponible.";
      const endYear = d.Status === "Active" && !d.End ? "now" : d.End;
      const collaboratorsList = d.Collaborators.map(c => `<li>${c}</li>`).join("");
      const devTeamList = d.devTeam.map(dt => `<li>${dt}</li>`).join("");
      const linkContent = descObj && descObj.link ? `<p class="link"><strong>Link:</strong> <a href="${descObj.link}" target="_blank">${descObj.link}</a></p>` : "";
      const popupContent = `
        <div class="project-info">
          <p><strong>Initiative:</strong> ${d.Initiative}</p>
          <p><strong>Funding:</strong> ${d.fundings}</p>
          <p><strong>Years:</strong> ${d.Start} - ${endYear}</p>
          <p><strong>Development Team:</strong></p>
          <ul>${devTeamList || "<li>Aucun développeur</li>"}</ul>
          <p><strong>Collaborators:</strong></p>
          <ul>${collaboratorsList || "<li>Aucun collaborateur</li>"}</ul>
          <p><strong>Status:</strong> ${d.Status}</p>
        </div>
        <div class="description">${description}${linkContent}</div>
      `;
      d3.select("#popup-title").text(d.name);
      d3.select("#popup-content").html(popupContent);
      d3.select("#popup").classed("show", true);
      d3.select("#popup-overlay").classed("show", true);
    });

  console.log("Cercles créés:", data.length);

  label = g.selectAll("g.project-label")
    .data(data, d => d.name)
    .join("g")
    .attr("class", "project-label")
    .attr("transform", d => `translate(${isNaN(d.x) ? 0 : d.x},${isNaN(d.y) ? 0 : d.y})`);

  label.each(function(d) {
    const fontSize = Math.max(10, d.radius / 6);
    const maxWidth = 2 * d.radius - 10;
    const words = d.name.split(/\s+/);
    let lines = [];
    let line = '';

    words.forEach(word => {
      const testLine = line + (line ? ' ' : '') + word;
      const testWidth = testLine.length * fontSize * 0.95;
      if (testWidth <= maxWidth - 10) {
        line = testLine;
      } else {
        if (line) lines.push(line);
        if (word.length * fontSize * 0.95 > maxWidth - 10) {
          let remaining = word;
          while (remaining.length > 0) {
            let i = Math.floor((maxWidth - 10) / (fontSize * 0.95));
            if (i >= remaining.length) {
              lines.push(remaining);
              remaining = '';
            } else {
              lines.push(remaining.slice(0, i));
              remaining = remaining.slice(i);
            }
          }
        } else {
          line = word;
        }
      }
    });
    if (line) lines.push(line);

    const rectHeight = Math.max(24, lines.length * fontSize * 1.2 + 10);
    const textWidth = d.name.length * fontSize * 0.95;
    const rectWidth = Math.min(textWidth + 10, maxWidth);

    d3.select(this).append("rect")
      .attr("x", -rectWidth / 2)
      .attr("y", -rectHeight / 2)
      .attr("width", rectWidth)
      .attr("height", rectHeight)
      .attr("fill", d => color(d.Topic))
      .attr("rx", 4)
      .attr("pointer-events", "none");

    const text = d3.select(this).append("text")
      .attr("text-anchor", "middle")
      .attr("font-size", fontSize + "px")
      .attr("fill", d => statusColor(d.Status))
      .attr("y", -rectHeight / 2 + fontSize * 0.6)
      .attr("pointer-events", "none");

    lines.forEach((line, i) => {
      text.append("tspan")
        .attr("x", 0)
        .attr("dy", i === 0 ? `${fontSize * 0.35}px` : `${fontSize * 1.2}px`)
        .text(line);
    });
  });

  d3.select("#popup-close").on("click", () => {
    d3.select("#popup").classed("show", false);
    d3.select("#popup-overlay").classed("show", false);
  });

  d3.select("#popup-overlay").on("click", () => {
    d3.select("#popup").classed("show", false);
    d3.select("#popup-overlay").classed("show", false);
  });

  const zoom = d3.zoom()
    .scaleExtent([0.3, 6])
    .on("zoom", (event) => {
      g.attr("transform", event.transform);
    });

  svg.call(zoom);

  svg.on("wheel", function(event) {
    event.preventDefault();
    const scaleFactor = event.deltaY < 0 ? 1.1 : 0.9;
    const mouseX = event.clientX - this.getBoundingClientRect().left - radius;
    const mouseY = event.clientY - this.getBoundingClientRect().top - radius;
    svg.call(zoom.scaleBy, scaleFactor, [mouseX, mouseY]);
  });

  const filterContainer = d3.select("#filters");

  const infoButton = filterContainer.append("div")
    .style("text-align", "right")
    .style("margin", "10px")
    .style("margin-top", "20px");

  infoButton.append("span")
    .attr("id", "info-button")
    .style("cursor", "pointer")
    .style("display", "inline-block")
    .style("width", "20px")
    .style("height", "20px")
    .style("border-radius", "50%")
    .style("background-color", "#ccc")
    .style("text-align", "center")
    .style("line-height", "20px")
    .style("font-size", "14px")
    .style("color", "#000")
    .text("i")
    .on("click", () => {
      d3.select("#popup-title").text("Information");
      d3.select("#popup-content").html("Informations sur la visualisation...");
      d3.select("#popup").classed("show", true);
      d3.select("#popup-overlay").classed("show", true);
    });

  initSlider(minYear, maxYear);

  Object.entries(filters).forEach(([key, options]) => {
    const group = filterContainer.append("div");
    group.append("h3").text(key.charAt(0).toUpperCase() + key.slice(1));
    options.forEach(option => {
      const label = group.append("label")
        .style("display", "flex")
        .style("align-items", "center")
        .style("margin", "5px 0");
      if (key === "Topic") {
        label.append("span")
          .attr("class", "color-box")
          .style("background-color", color(option.value))
          .style("width", "15px")
          .style("height", "15px")
          .style("margin-right", "5px");
      }
      label.append("input")
        .attr("type", "checkbox")
        .attr("value", option.value)
        .attr("data-key", key)
        .style("--checkbox-color", key === "Topic" ? color(option.value) : "#3b82f6")
        .on("change", function() {
          console.log(`Filtre changé: ${key} = ${option.value}, checked = ${this.checked}`);
          updateFilters();
        });
      const labelSpan = label.append("span")
        .style("margin-left", "5px");
      labelSpan.text(option.label + " (");
      labelSpan.append("span")
        .attr("class", "count")
        .text("0");
      labelSpan.append("span").text(")");
    });
  });

  Object.entries(filters).forEach(([key, options]) => {
    options.forEach(option => {
      const count = data.filter(d => filters[key].find(f => f.value === option.value).test(d)).length;
      console.log(`Compte initial pour ${key} - ${option.value}: ${count}`);
      try {
        const input = d3.select(`#filters input[value="${escapeCSSSelector(option.value)}"][data-key="${key}"]`);
        if (input.node()) {
          input.node().parentNode.querySelector(".count").textContent = count;
        } else {
          console.warn(`Input non trouvé pour ${key} - ${option.value}`);
        }
      } catch (e) {
        console.error(`Erreur avec le sélecteur pour ${key} - ${option.value}:`, e);
      }
    });
  });

  updateFilters();
}

// Gérer le burger menu
document.addEventListener('DOMContentLoaded', () => {
  console.log("DOM chargé, initialisation du burger menu");
  const burgerBtn = document.getElementById('burger-btn');
  const container = document.getElementById('container');

  if (!burgerBtn || !container) {
    console.error("Éléments burger-btn ou container introuvables");
    return;
  }

  burgerBtn.addEventListener('click', () => {
    console.log("Clic sur le burger menu");
    container.classList.toggle('hidden');
    burgerBtn.classList.toggle('active');
  });
});

// Lancer le chargement des données
fetchCSV();