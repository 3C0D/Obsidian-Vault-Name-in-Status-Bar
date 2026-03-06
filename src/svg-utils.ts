export function createLockBadgeSVG(doc: Document): SVGElement {
	const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
	svg.setAttribute('width', '8');
	svg.setAttribute('height', '8');
	svg.setAttribute('viewBox', '0 0 24 24');
	svg.setAttribute('fill', 'currentColor');
	svg.setAttribute('stroke', 'none');
	
	const rect = doc.createElementNS('http://www.w3.org/2000/svg', 'rect');
	rect.setAttribute('width', '18');
	rect.setAttribute('height', '11');
	rect.setAttribute('x', '3');
	rect.setAttribute('y', '11');
	rect.setAttribute('rx', '2');
	rect.setAttribute('ry', '2');
	svg.appendChild(rect);
	
	const path = doc.createElementNS('http://www.w3.org/2000/svg', 'path');
	path.setAttribute('d', 'M7 11V7a5 5 0 0 1 10 0v4');
	svg.appendChild(path);
	
	return svg;
}
