
fetch('/api/stories')
    .then(response => response.json())
    .then(data => {
        const storyList = document.getElementById('story-list');
        data.forEach(story => {
            const storyItem = document.createElement('li');
            storyItem.textContent = story.title;
            storyList.appendChild(storyItem);
        });
    });

// lấy chi tiết truyện khi click vào truyện
document.getElementById('story-list').addEventListener('click', event => {
    if (event.target.tagName === 'LI') {
        const storyId = event.target.dataset.storyId;
        fetch(`/api/stories/${storyId}`)
            .then(response => response.json())
            .then(data => {
                const storyDetail = document.getElementById('story-detail');
storyDetail.innerHTML = `
                    <h2>${data.title}</h2>
                    <p>${data.content}</p>
                `;
            });
    }
});