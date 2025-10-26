// Code Copy Functionality
document.addEventListener('DOMContentLoaded', function() {
  // Add copy buttons to all code blocks
  const codeBlocks = document.querySelectorAll('pre code');
  
  codeBlocks.forEach(function(codeBlock) {
    const pre = codeBlock.parentElement;
    
    // Create wrapper for code block
    const wrapper = document.createElement('div');
    wrapper.className = 'code-block-wrapper';
    pre.parentNode.insertBefore(wrapper, pre);
    wrapper.appendChild(pre);
    
    // Detect language from class name
    let language = 'code';
    const classList = codeBlock.className.split(' ');
    const preClassList = pre.className ? pre.className.split(' ') : [];
    
    // Method 1: Check code element for language- prefix
    for (let className of classList) {
      if (className.startsWith('language-')) {
        language = className.replace('language-', '');
        break;
      }
    }
    
    // Method 2: Check pre element for language- prefix
    if (language === 'code') {
      for (let className of preClassList) {
        if (className.startsWith('language-')) {
          language = className.replace('language-', '');
          break;
        }
      }
    }
    
    // Method 3: Check for Rouge/Pygments highlight wrapper
    if (language === 'code') {
      let parent = pre.parentElement;
      while (parent && parent !== document.body) {
        if (parent.className) {
          const parentClasses = parent.className.split(' ');
          for (let className of parentClasses) {
            if (className.startsWith('language-')) {
              language = className.replace('language-', '');
              break;
            }
            // Check for highlight-<lang> pattern
            if (className.startsWith('highlight-')) {
              language = className.replace('highlight-', '');
              break;
            }
          }
          if (language !== 'code') break;
        }
        parent = parent.parentElement;
      }
    }
    
    // Method 4: Check for direct language class names (no prefix)
    if (language === 'code') {
      const allClasses = [...classList, ...preClassList];
      for (let className of allClasses) {
        if (className.match(/^(go|golang|python|py|javascript|js|yaml|yml|bash|sh|shell|sql|java|cpp|c|rust|ruby|rb|lua|text|plaintext|json|xml|html|css|typescript|ts)$/i)) {
          language = className.toLowerCase();
          break;
        }
      }
    }
    
    // Method 5: Try to detect from code content patterns
    if (language === 'code') {
      const codeText = codeBlock.textContent.trim();
      // Check for common patterns
      if (codeText.includes('func ') && codeText.includes('package ')) {
        language = 'go';
      } else if (codeText.includes('def ') || codeText.includes('import ')) {
        language = 'python';
      } else if (codeText.includes('apiVersion:') || codeText.includes('kind:')) {
        language = 'yaml';
      } else if (codeText.match(/^\s*(SELECT|INSERT|UPDATE|DELETE)/i)) {
        language = 'sql';
      } else if (codeText.includes('function') || codeText.includes('const ') || codeText.includes('let ')) {
        language = 'javascript';
      }
    }
    
    // Create header with language and copy button
    const header = document.createElement('div');
    header.className = 'code-block-header';
    
    const languageLabel = document.createElement('span');
    languageLabel.className = 'code-language';
    languageLabel.textContent = language.toUpperCase();
    
    const copyButton = document.createElement('button');
    copyButton.className = 'code-copy-button';
    copyButton.innerHTML = '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M4 2a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V2zm2-1a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V2a1 1 0 0 0-1-1H6zM2 5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-1h1v1a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h1v1H2z"/></svg> Copy';
    copyButton.setAttribute('aria-label', 'Copy code to clipboard');
    
    copyButton.addEventListener('click', function() {
      const code = codeBlock.textContent;
      
      navigator.clipboard.writeText(code).then(function() {
        // Success feedback
        copyButton.innerHTML = '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M13.854 3.646a.5.5 0 0 1 0 .708l-7 7a.5.5 0 0 1-.708 0l-3.5-3.5a.5.5 0 1 1 .708-.708L6.5 10.293l6.646-6.647a.5.5 0 0 1 .708 0z"/></svg> Copied!';
        copyButton.classList.add('copied');
        
        setTimeout(function() {
          copyButton.innerHTML = '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M4 2a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V2zm2-1a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V2a1 1 0 0 0-1-1H6zM2 5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-1h1v1a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h1v1H2z"/></svg> Copy';
          copyButton.classList.remove('copied');
        }, 2000);
      }).catch(function(err) {
        console.error('Failed to copy code: ', err);
        copyButton.textContent = 'Failed';
        setTimeout(function() {
          copyButton.innerHTML = '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M4 2a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V2zm2-1a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V2a1 1 0 0 0-1-1H6zM2 5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-1h1v1a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h1v1H2z"/></svg> Copy';
        }, 2000);
      });
    });
    
    header.appendChild(languageLabel);
    header.appendChild(copyButton);
    wrapper.insertBefore(header, pre);
  });
  
  // TOC Active State on Scroll
  const tocLinks = document.querySelectorAll('.toc-nav a');
  const headings = document.querySelectorAll('h1[id], h2[id], h3[id], h4[id], h5[id], h6[id]');
  
  if (tocLinks.length > 0 && headings.length > 0) {
    let currentActive = null;
    
    function updateActiveLink() {
      let current = '';
      
      headings.forEach(function(heading) {
        const rect = heading.getBoundingClientRect();
        if (rect.top <= 150) {
          current = heading.getAttribute('id');
        }
      });
      
      if (current !== currentActive) {
        tocLinks.forEach(function(link) {
          link.parentElement.classList.remove('active');
          if (link.getAttribute('href') === '#' + current) {
            link.parentElement.classList.add('active');
            
            // Auto-scroll TOC to keep active item visible
            setTimeout(function() {
              const tocWrapper = document.querySelector('.toc-wrapper');
              if (tocWrapper && link) {
                // Get the position of the active link relative to the TOC wrapper
                const linkOffsetTop = link.offsetTop;
                const tocScrollTop = tocWrapper.scrollTop;
                const tocHeight = tocWrapper.clientHeight;
                const linkHeight = link.clientHeight;
                
                // Calculate if link is outside visible area
                const linkTop = linkOffsetTop - tocScrollTop;
                const linkBottom = linkTop + linkHeight;
                
                // If link is not fully visible, scroll to center it
                if (linkTop < 0 || linkBottom > tocHeight) {
                  const scrollTo = linkOffsetTop - (tocHeight / 2) + (linkHeight / 2);
                  tocWrapper.scrollTo({
                    top: scrollTo,
                    behavior: 'smooth'
                  });
                }
              }
            }, 100);
          }
        });
        currentActive = current;
      }
    }
    
    window.addEventListener('scroll', updateActiveLink);
    updateActiveLink();
    
    // Smooth scroll for TOC links
    tocLinks.forEach(function(link) {
      link.addEventListener('click', function(e) {
        e.preventDefault();
        const targetId = this.getAttribute('href').substring(1);
        const targetElement = document.getElementById(targetId);
        
        if (targetElement) {
          const offset = 100;
          const elementPosition = targetElement.getBoundingClientRect().top;
          const offsetPosition = elementPosition + window.pageYOffset - offset;
          
          window.scrollTo({
            top: offsetPosition,
            behavior: 'smooth'
          });
        }
      });
    });
  }
});
