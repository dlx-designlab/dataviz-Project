// Variables globales pour les données
let data = [];
let desc = [];

// Fonction pour nettoyer les guillemets et caractères problématiques dans les champs CSV
function cleanCSVField(field) {
    return field
        .replace(/^"(.*)"$/, '$1') // Supprimer les guillemets englobants
        .replace(/"/g, '')          // Supprimer tous les guillemets résiduels
        .replace(/\s+/g, ' ')       // Remplacer les espaces multiples par un seul
        .trim();                    // Supprimer les espaces de début et de fin
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

    // Extraire les en-têtes
    const headers = lines[0].split(",").map(cleanCSVField);
    const result = [];

    // Fonction pour parser une ligne en respectant les guillemets
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

        // Ajouter le dernier champ
        fields.push(cleanCSVField(currentField));
        return fields;
    }

    // Parser chaque ligne
    for (let i = 1; i < lines.length; i++) {
        const row = parseCSVLine(lines[i]);
        if (row.length < headers.length) continue; // Ignorer les lignes incomplètes

        const entry = {};
        headers.forEach((header, index) => {
            if (header === "Dev (s)") {
                entry["devTeam"] = row[index] ? row[index].split(";").map(s => s.trim()) : [];
            } else if (header === "Collaborator 1" || header === "Collaborator 2") {
                entry["Collaborators"] = entry["Collaborators"] || [];
                if (row[index]) {
                    entry["Collaborators"].push(row[index]);
                }
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

            desc = parsedData.map(entry => ({
                name: entry["Project name"] || "",
                link: "",
                desc: entry["Description"] || ""
            }));

            console.log('Data finale:', data);
            console.log('Desc finale:', desc);

            if (data.length === 0) {
                console.error("Aucune donnée valide chargée");
                return;
            }

            initializeVisualization();
        })
        .catch(error => console.error('Erreur lors du chargement du CSV:', error));
}

// Fonction principale de visualisation
function initializeVisualization() {
    // Calculer la durée des projets pour la taille des cercles
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
        const startDate = new Date(d.Start);
        const endDate = new Date(endYear);
        d.duration = (endDate.getFullYear() - startDate.getFullYear()) * 12 + (endDate.getMonth() - startDate.getMonth());
        d.duration = Math.max(0, d.duration || parseInt(d.MonthLenght) || 1);
    });

    // Définir l'échelle des rayons
    const maxDuration = d3.max(data, d => d.duration) || 1;
    const radiusScale = d3.scaleLinear()
        .domain([0, maxDuration])
        .range([80, 160]);
    data.forEach(d => {
        d.radius = radiusScale(d.duration);
    });

    // Générer les filtres
    const filters = {
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

    // Loguer les valeurs des filtres pour débogage
    console.log('Valeurs des filtres:', {
        Topic: filters.Topic.map(f => f.value),
        Outcome: filters.Outcome.map(f => f.value),
        Status: filters.Status.map(f => f.value)
    });

    // Couleurs par Topic
    const color = d3.scaleOrdinal()
        .domain([...new Set(data.map(d => d.Topic))])
        .range(d3.schemeCategory10);

    // Couleurs des étiquettes par Status
    const statusColor = d3.scaleOrdinal()
        .domain(["Active", "Complete", "Inactive"])
        .range(["#FFFFFF", "#000000", "#000000"]);

    // Dimensions du SVG
    const radius = 1800;
    const width = radius * 2;
    const height = radius * 2;

    // Créer le SVG
    const svg = d3.select("#chart")
        .append("svg")
        .attr("width", width)
        .attr("height", height)
        .attr("viewBox", `-${radius} -${radius} ${width} ${height}`)
        .attr("preserveAspectRatio", "xMidYMid meet");

    // Ajouter un clip-path circulaire
    svg.append("clipPath")
        .attr("id", "circle-clip")
        .append("circle")
        .attr("cx", 0)
        .attr("cy", 0)
        .attr("r", radius);

    // Définir les motifs pour les images
    data.forEach(d => {
        svg.append("defs")
            .append("pattern")
            .attr("id", `image-${d.name.replace(/\s+/g, '-')}`)
            .attr("width", "100%")
            .attr("height", "100%")
            .attr("patternContentUnits", "objectBoundingBox")
            .append("image")
            .attr("xlink:href", "image/Transparent-Intent.png")
            .attr("width", 1)
            .attr("height", 1)
            .attr("preserveAspectRatio", "xMidYMid slice");
    });

    // Groupe pour éléments zoomables
    const g = svg.append("g")
        .attr("clip-path", "url(#circle-clip)");

    // Positionner les cercles
    function positionCirclesRandomly(data) {
        console.log("Positionnement des cercles pour", data.length, "projets");
        const topics = [...new Set(data.map(d => d.Topic))];
        const topicCenters = {};

        topics.forEach(topic => {
            let x, y, tooClose;
            let attempts = 0;
            const maxAttempts = 500;
            do {
                const angle = Math.random() * 2 * Math.PI;
                const distance = Math.sqrt(Math.random()) * (radius - 200);
                x = distance * Math.cos(angle);
                y = distance * Math.sin(angle);
                tooClose = Object.values(topicCenters).some(center => {
                    const dx = center.x - x;
                    const dy = center.y - y;
                    return Math.sqrt(dx * dx + dy * dy) < 300;
                });
                attempts++;
            } while (tooClose && attempts < maxAttempts);
            topicCenters[topic] = { x, y };
        });

        const placed = [];
        data.sort((a, b) => a.Topic.localeCompare(b.Topic));

        data.forEach((d, i) => {
            const center = topicCenters[d.Topic];
            let x, y;

            if (placed.length === 0) {
                x = center.x;
                y = center.y;
            } else {
                let placedSuccessfully = false;
                let attempts = 0;
                const maxAttempts = 500;

                while (!placedSuccessfully && attempts < maxAttempts) {
                    const refCircle = placed[Math.floor(Math.random() * placed.length)];
                    const refX = refCircle.x;
                    const refY = refCircle.y;
                    const refRadius = refCircle.radius;
                    const distance = refRadius + d.radius + 10;
                    const angle = Math.random() * 2 * Math.PI;
                    x = refX + distance * Math.cos(angle);
                    y = refY + distance * Math.sin(angle);

                    const distanceFromCenter = Math.sqrt(x * x + y * y);
                    if (distanceFromCenter + d.radius > radius - 50) {
                        attempts++;
                        continue;
                    }

                    let isOverlapping = false;
                    for (const p of placed) {
                        const dx = p.x - x;
                        const dy = p.y - y;
                        const dist = Math.sqrt(dx * dx + dy * dy);
                        const sumRadii = p.radius + d.radius;
                        if (dist < sumRadii - 0.1) {
                            isOverlapping = true;
                            break;
                        }
                    }

                    if (!isOverlapping) {
                        placedSuccessfully = true;
                    }

                    attempts++;
                }

                if (!placedSuccessfully) {
                    const angle = Math.random() * 2 * Math.PI;
                    const distance = Math.random() * 50;
                    x = center.x + distance * Math.cos(angle);
                    y = center.y + distance * Math.sin(angle);
                    if (Math.sqrt(x * x + y * y) + d.radius > radius - 50) {
                        x = center.x;
                        y = center.y;
                    }
                }
            }

            d.x = x;
            d.y = y;
            placed.push(d);
        });
        console.log("Positions calculées:", placed.map(d => ({ name: d.name, x: d.x, y: d.y })));
    }

    // Initialiser les positions
    positionCirclesRandomly(data);

    // Créer les cercles
    let node = g.selectAll("circle")
        .data(data, d => d.name)
        .join("circle")
        .attr("r", d => d.radius)
        .attr("cx", d => d.x)
        .attr("cy", d => d.y)
        .attr("fill", d => `url(#image-${d.name.replace(/\s+/g, '-')})`)
        .attr("stroke", d => color(d.Topic))
        .attr("stroke-width", 8)
        .attr("cursor", "pointer")
        .on("mouseover", function(event, d) {
            d3.select(this)
                .transition()
                .duration(200)
                .attr("r", d.radius * 1.1);
        })
        .on("mouseout", function(event, d) {
            d3.select(this)
                .transition()
                .duration(200)
                .attr("r", d.radius);
        })
        .on("click", (event, d) => {
            const descObj = desc.find(p => p.name === d.name);
            const description = descObj && descObj.desc ? descObj.desc : "Aucune description disponible pour ce projet.";
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

    // Créer les étiquettes
    let label = g.selectAll("g.project-label")
        .data(data, d => d.name)
        .join("g")
        .attr("class", "project-label")
        .attr("transform", d => `translate(${d.x},${d.y})`);

    label.append("rect")
        .attr("x", d => -((d.name.length * Math.max(12, d.radius / 5) * 0.6 + 10) / 2))
        .attr("y", -12)
        .attr("width", d => d.name.length * Math.max(12, d.radius / 5) * 0.6 + 10)
        .attr("height", 24)
        .attr("fill", d => color(d.Topic))
        .attr("rx", 4)
        .attr("pointer-events", "none");

    label.append("text")
        .attr("text-anchor", "middle")
        .attr("dy", ".35em")
        .attr("font-size", d => Math.max(12, d.radius / 5) + "px")
        .attr("fill", d => statusColor(d.Status))
        .attr("pointer-events", "none")
        .text(d => d.name);

    // Fermer la pop-up
    d3.select("#popup-close").on("click", () => {
        d3.select("#popup").classed("show", false);
        d3.select("#popup-overlay").classed("show", false);
    });

    d3.select("#popup-overlay").on("click", () => {
        d3.select("#popup").classed("show", false);
        d3.select("#popup-overlay").classed("show", false);
    });

    // Zoom et déplacement
    const zoom = d3.zoom()
        .scaleExtent([0.3, 6])
        .on("zoom", (event) => {
            g.attr("transform", event.transform);
        });

    svg.call(zoom);

    // Zoom avec la molette
    svg.on("wheel", function(event) {
        event.preventDefault();
        const scaleFactor = event.deltaY < 0 ? 1.1 : 0.9;
        const mouseX = event.clientX - this.getBoundingClientRect().left - radius;
        const mouseY = event.clientY - this.getBoundingClientRect().top - radius;
        svg.call(zoom.scaleBy, scaleFactor, [mouseX, mouseY]);
    });

    // Créer les filtres
    const filterContainer = d3.select("#filters");

    // Ajouter le bouton d'information
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

    // Créer les filtres dynamiquement
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

    // Stocker l'état des filtres
    const activeFilters = {
        Topic: new Set(),
        Outcome: new Set(),
        Status: new Set()
    };

    // Fonction pour calculer le nombre de projets pour une option
    function countProjectsForFilter(key, option) {
        return data.filter(d => {
            let pass = filters[key].find(f => f.value === option.value).test(d);
            // Appliquer les autres filtres actifs
            if (key !== "Topic" && activeFilters.Topic.size > 0) {
                pass = pass && Array.from(activeFilters.Topic).some(value => filters.Topic.find(f => f.value === value).test(d));
            }
            if (key !== "Outcome" && activeFilters.Outcome.size > 0) {
                pass = pass && Array.from(activeFilters.Outcome).some(value => filters.Outcome.find(f => f.value === value).test(d));
            }
            if (key !== "Status" && activeFilters.Status.size > 0) {
                pass = pass && Array.from(activeFilters.Status).some(value => filters.Status.find(f => f.value === value).test(d));
            }
            return pass;
        }).length;
    }

    // Mettre à jour les cercles et les comptes selon les filtres
    function updateFilters() {
        // Réinitialiser les filtres actifs
        activeFilters.Topic.clear();
        activeFilters.Outcome.clear();
        activeFilters.Status.clear();

        // Collecter les filtres actifs
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

        // Mettre à jour les comptes pour chaque option de filtre
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

        // Filtrer les données
        const filteredData = data.filter(d => {
            const topicPass = activeFilters.Topic.size === 0 || activeFilters.Topic.has(d.Topic);
            const outcomePass = activeFilters.Outcome.size === 0 || activeFilters.Outcome.has(d.Outcome);
            const statusPass = activeFilters.Status.size === 0 || activeFilters.Status.has(d.Status);
            return topicPass && outcomePass && statusPass;
        });

        console.log("Projets filtrés:", filteredData.map(d => d.name));

        // Repositionner les cercles filtrés
        positionCirclesRandomly(filteredData);

        // Mettre à jour les cercles
        node = g.selectAll("circle")
            .data(filteredData, d => d.name)
            .join(
                enter => enter.append("circle")
                    .attr("r", 0)
                    .attr("cx", d => d.x)
                    .attr("cy", d => d.y)
                    .attr("fill", d => `url(#image-${d.name.replace(/\s+/g, '-')})`)
                    .attr("stroke", d => color(d.Topic))
                    .attr("stroke-width", 8)
                    .attr("cursor", "pointer")
                    .on("mouseover", function(event, d) {
                        d3.select(this)
                            .transition()
                            .duration(200)
                            .attr("r", d.radius * 1.1);
                    })
                    .on("mouseout", function(event, d) {
                        d3.select(this)
                            .transition()
                            .duration(200)
                            .attr("r", d.radius);
                    })
                    .on("click", (event, d) => {
                        const descObj = desc.find(p => p.name === d.name);
                        const description = descObj && descObj.desc ? descObj.desc : "Aucune description disponible pour ce projet.";
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
                    .attr("cx", d => d.x)
                    .attr("cy", d => d.y)
                    .attr("r", d => d.radius),
                exit => exit
                    .transition().duration(500)
                    .attr("r", 0)
                    .remove()
            );

        // Mettre à jour les étiquettes
        label = g.selectAll("g.project-label")
            .data(filteredData, d => d.name)
            .join(
                enter => {
                    const gEnter = enter.append("g")
                        .attr("class", "project-label")
                        .attr("transform", d => `translate(${d.x},${d.y})`)
                        .attr("opacity", 0);
                    
                    gEnter.append("rect")
                        .attr("x", d => -((d.name.length * Math.max(12, d.radius / 5) * 0.6 + 10) / 2))
                        .attr("y", -12)
                        .attr("width", d => d.name.length * Math.max(12, d.radius / 5) * 0.6 + 10)
                        .attr("height", 24)
                        .attr("fill", d => color(d.Topic))
                        .attr("rx", 4)
                        .attr("pointer-events", "none");
                    
                    gEnter.append("text")
                        .attr("text-anchor", "middle")
                        .attr("dy", ".35em")
                        .attr("font-size", d => Math.max(12, d.radius / 5) + "px")
                        .attr("fill", d => statusColor(d.Status))
                        .attr("pointer-events", "none")
                        .text(d => d.name);
                    
                    return gEnter.transition().duration(500)
                        .attr("opacity", 1);
                },
                update => update
                    .transition().duration(500)
                    .attr("transform", d => `translate(${d.x},${d.y})`)
                    .each(function(d) {
                        d3.select(this).select("rect")
                            .attr("x", -((d.name.length * Math.max(12, d.radius / 5) * 0.6 + 10) / 2))
                            .attr("width", d.name.length * Math.max(12, d.radius / 5) * 0.6 + 10)
                            .attr("fill", color(d.Topic));
                        d3.select(this).select("text")
                            .attr("font-size", Math.max(12, d.radius / 5) + "px")
                            .attr("fill", statusColor(d.Status));
                    }),
                exit => exit
                    .transition().duration(500)
                    .attr("opacity", 0)
                    .remove()
            );

        console.log("SVG mis à jour avec", filteredData.length, "projets");
    }

    // Initialiser les comptes
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

    // Initialiser avec tous les projets
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